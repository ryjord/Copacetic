import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));

const { certificateFor, forgetCertificates, observeCertificates, summariseCertificate } =
  await import('../electron/main/certificates');

type VerifyProc = (
  request: { hostname: string; certificate: unknown; verificationResult: string; errorCode: number },
  callback: (verdict: number) => void,
) => void;

/** Just enough Session to capture the proc the module installs. */
function fakeSession() {
  let proc: VerifyProc | null = null;
  return {
    session: { setCertificateVerifyProc: (fn: VerifyProc) => (proc = fn) },
    verify(hostname: string, certificate: unknown, verificationResult = 'net::OK'): number[] {
      const verdicts: number[] = [];
      proc?.({ hostname, certificate, verificationResult, errorCode: 0 }, (v) => verdicts.push(v));
      return verdicts;
    },
  };
}

const cert = (over: Record<string, unknown> = {}) => ({
  issuerName: "Let's Encrypt",
  subjectName: 'example.com',
  validStart: 1_700_000_000,
  validExpiry: 1_800_000_000,
  fingerprint: 'sha256/AAAA',
  ...over,
});

beforeEach(() => forgetCertificates());

describe('certificate verification is observed, never overridden', () => {
  // The single most important assertion in this file. `0` would mean "accept",
  // which would make every expired, self-signed and wrong-hostname certificate
  // on the internet valid. `-3` defers to Chromium's own verdict.
  it('always answers with Chromium’s own verdict', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);

    expect(fake.verify('example.com', cert())).toEqual([-3]);
  });

  it('answers with Chromium’s verdict even when the certificate was rejected', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);

    expect(fake.verify('bad.example', cert(), 'net::ERR_CERT_DATE_INVALID')).toEqual([-3]);
    expect(fake.verify('bad.example', cert(), 'net::ERR_CERT_AUTHORITY_INVALID')).toEqual([-3]);
  });

  it('answers with Chromium’s verdict even when recording would throw', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);

    // A malformed certificate must never stop a page loading.
    const hostile = {
      get issuerName(): string {
        throw new Error('nope');
      },
    };
    expect(fake.verify('example.com', hostile)).toEqual([-3]);
  });

  it('answers exactly once per verification', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);

    expect(fake.verify('example.com', cert())).toHaveLength(1);
  });
});

describe('what the badge is told', () => {
  it('remembers an accepted certificate against its host', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);
    fake.verify('example.com', cert());

    expect(certificateFor('example.com')).toMatchObject({
      issuer: "Let's Encrypt",
      subject: 'example.com',
      fingerprint: 'sha256/AAAA',
    });
  });

  // Reporting the issuer of a certificate Chromium refused would dress up a
  // failed connection as an informative one.
  it('does not remember a certificate Chromium rejected', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);
    fake.verify('bad.example', cert(), 'net::ERR_CERT_DATE_INVALID');

    expect(certificateFor('bad.example')).toBeNull();
  });

  it('matches hosts case-insensitively', () => {
    const fake = fakeSession();
    observeCertificates(fake.session as never);
    fake.verify('Example.COM', cert());

    expect(certificateFor('example.com')).not.toBeNull();
  });

  it('returns null for a host never seen', () => {
    expect(certificateFor('never-visited.example')).toBeNull();
  });
});

describe('summariseCertificate', () => {
  it('converts validity from seconds to milliseconds', () => {
    const summary = summariseCertificate(cert() as never);
    expect(summary.validFrom).toBe(1_700_000_000_000);
    expect(summary.validTo).toBe(1_800_000_000_000);
  });

  it('falls back to the common name when there is no full name', () => {
    const summary = summariseCertificate({
      issuerName: '',
      issuer: { commonName: 'Internal CA' },
      subjectName: '',
      subject: { commonName: 'intranet' },
      validStart: 0,
      validExpiry: 0,
      fingerprint: '',
    } as never);

    expect(summary.issuer).toBe('Internal CA');
    expect(summary.subject).toBe('intranet');
  });

  it('never reports an empty issuer', () => {
    const summary = summariseCertificate({ validStart: 0, validExpiry: 0 } as never);
    expect(summary.issuer).toBe('Unknown');
  });
});
