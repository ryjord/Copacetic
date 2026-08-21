import { describe, expect, it } from 'vitest';
import {
  type RememberedCertificate,
  compareCertificate,
  rememberCertificate,
} from '../../electron/shared/certificate-changes';

const remembered = (overrides: Partial<RememberedCertificate> = {}): RememberedCertificate => ({
  fingerprint: 'aa:bb',
  issuer: "Let's Encrypt",
  isIssuedByKnownRoot: true,
  firstSeenAt: 1_000,
  ...overrides,
});

const seen = (overrides: Partial<Omit<RememberedCertificate, 'firstSeenAt'>> = {}) => ({
  fingerprint: 'aa:bb',
  issuer: "Let's Encrypt",
  isIssuedByKnownRoot: true,
  ...overrides,
});

describe('what is not worth saying', () => {
  it('says nothing on a first visit', () => {
    expect(compareCertificate(null, seen()).change).toBe('none');
  });

  it('says nothing when the certificate is the same', () => {
    expect(compareCertificate(remembered(), seen()).change).toBe('none');
  });

  /**
   * Certificates are renewed every few months. Reporting each one would train
   * someone to click past the warning that matters.
   */
  it('says nothing about an ordinary renewal from the same authority', () => {
    expect(compareCertificate(remembered(), seen({ fingerprint: 'cc:dd' })).change).toBe('none');
  });
});

/**
 * The case worth interrupting for. A chain that used to end at a root shipped
 * with the system and now ends at one installed on this machine is what a
 * workplace proxy, an antivirus that opens TLS, and an attacker with local
 * access all look like from in here.
 */
describe('a chain that now ends locally', () => {
  const change = compareCertificate(
    remembered(),
    seen({ fingerprint: 'cc:dd', issuer: 'Acme Corp Proxy', isIssuedByKnownRoot: false }),
  );

  it('is reported', () => {
    expect(change.change).toBe('now-locally-trusted');
  });

  it('says something is reading the connection', () => {
    expect(change.detail).toContain('reading this connection');
  });

  // Naming the innocent explanations first is the difference between informing
  // someone and frightening them.
  it('names the ordinary explanations as well as the bad one', () => {
    expect(change.detail).toContain('workplace proxy');
    expect(change.detail).toContain('attacker');
  });

  it('outranks a mere change of issuer', () => {
    const both = compareCertificate(
      remembered(),
      seen({ fingerprint: 'cc:dd', issuer: 'Someone Else', isIssuedByKnownRoot: false }),
    );
    expect(both.change).toBe('now-locally-trusted');
  });
});

describe('a different authority', () => {
  const change = compareCertificate(remembered(), seen({ fingerprint: 'cc:dd', issuer: 'DigiCert' }));

  it('is mentioned', () => {
    expect(change.change).toBe('issuer-changed');
  });

  it('names both, so the person can judge it', () => {
    expect(change.detail).toContain('DigiCert');
    expect(change.detail).toContain("Let's Encrypt");
  });

  // Sites migrate authority all the time. An alarm here is a lie.
  it('is worded as something to glance at rather than an alarm', () => {
    expect(change.detail).toContain('rather than an alarm');
  });

  it('is not raised when a locally-trusted chain becomes a real one', () => {
    const recovering = compareCertificate(
      remembered({ isIssuedByKnownRoot: false, issuer: 'Acme Corp Proxy' }),
      seen({ fingerprint: 'cc:dd' }),
    );
    expect(recovering.change).toBe('issuer-changed');
  });
});

describe('what gets remembered', () => {
  it('records the current certificate', () => {
    const next = rememberCertificate(null, seen({ fingerprint: 'cc:dd' }), 5_000);
    expect(next).toMatchObject({ fingerprint: 'cc:dd', firstSeenAt: 5_000 });
  });

  // "First seen" should mean the site, not this particular certificate, or it
  // resets every renewal and stops meaning anything.
  it('keeps the original first-seen across a renewal', () => {
    const next = rememberCertificate(remembered(), seen({ fingerprint: 'cc:dd' }), 9_000);
    expect(next.firstSeenAt).toBe(1_000);
  });

  it('carries the locally-trusted flag forward', () => {
    const next = rememberCertificate(remembered(), seen({ isIssuedByKnownRoot: false }), 9_000);
    expect(next.isIssuedByKnownRoot).toBe(false);
  });
});
