import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (
  event: { preventDefault: () => void },
  contents: unknown,
  url: string,
  error: string,
  certificate: unknown,
  callback: (trust: boolean) => void,
) => void;

let registered: Handler | null = null;
vi.mock('electron', () => ({
  app: {
    on: (name: string, handler: Handler) => {
      if (name === 'certificate-error') {
        registered = handler;
      }
    },
  },
}));

const {
  acceptRefused,
  canAcceptRefused,
  exceptionFor,
  forgetCertificateExceptions,
  mayTrustLocally,
  watchCertificateErrors,
} = await import('../../electron/main/security/certificate-exceptions');

const trustedLocally = (origin: string) => exceptionFor(origin) === 'local';

/**
 * The whole exception rests on this one question, so it is the one thing that
 * has to be exactly right: a certificate nobody signed is accepted only from a
 * server on this machine, where reaching the traffic already means being on the
 * machine.
 */
describe('whose certificate may be trusted without checking it', () => {
  it.each([
    'https://localhost/',
    'https://localhost:3000/app',
    'https://127.0.0.1/',
    'https://127.0.0.1:8443/x',
    'https://[::1]:5173/',
    'https://api.localhost/',
  ])('trusts %s, which is this machine', (url) => {
    expect(mayTrustLocally(url)).toBe(true);
  });

  // Every one of these is a name that looks like loopback and is not.
  it.each([
    'https://localhost.example.com/',
    'https://notlocalhost/',
    'https://127.0.0.1.example.com/',
    'https://localhost.evil/',
    'https://evil.com/?x=localhost',
    'https://example.com/',
    'https://192.168.1.1/',
    'https://10.0.0.1/',
    'https://[::2]/',
  ])('refuses %s', (url) => {
    expect(mayTrustLocally(url)).toBe(false);
  });

  // The exception is about an unverifiable certificate, so it only applies
  // where there is one.
  it('refuses anything that is not https', () => {
    expect(mayTrustLocally('http://localhost:3000/')).toBe(false);
    expect(mayTrustLocally('ws://localhost/')).toBe(false);
    expect(mayTrustLocally('file:///etc/passwd')).toBe(false);
  });

  it('refuses what is not a url at all', () => {
    expect(mayTrustLocally('')).toBe(false);
    expect(mayTrustLocally('localhost')).toBe(false);
    expect(mayTrustLocally('not a url')).toBe(false);
  });
});

/** Driving the handler itself, rather than the question it asks. */
describe('what happens when Chromium refuses a certificate', () => {
  function refuse(url: string, fingerprint = 'sha256/one', error = 'net::ERR_CERT_AUTHORITY_INVALID') {
    let prevented = false;
    let trusted: boolean | null = null;
    registered?.(
      { preventDefault: () => (prevented = true) },
      { id: 7 },
      url,
      error,
      { fingerprint },
      (answer) => (trusted = answer),
    );
    return { prevented, trusted };
  }

  beforeEach(() => {
    forgetCertificateExceptions();
    watchCertificateErrors();
  });

  it('overrides the refusal for a server on this machine', () => {
    expect(refuse('https://localhost:3000/app')).toEqual({ prevented: true, trusted: true });
  });

  // Chromium already said no, and it stays no.
  it('leaves the refusal standing for anywhere else', () => {
    expect(refuse('https://example.com/')).toEqual({ prevented: false, trusted: false });
    expect(refuse('https://localhost.example.com/')).toEqual({ prevented: false, trusted: false });
  });

  it('remembers the origin so the badge can stop claiming the certificate was checked', () => {
    refuse('https://localhost:3000/app');
    expect(trustedLocally('https://localhost:3000')).toBe(true);
  });

  // One bad certificate on one port says nothing about another.
  it('does not let one port speak for another', () => {
    refuse('https://localhost:8443/');
    expect(trustedLocally('https://localhost:8443')).toBe(true);
    expect(trustedLocally('https://localhost:3000')).toBe(false);
  });

  it('remembers nothing about a host it refused', () => {
    refuse('https://example.com/');
    expect(trustedLocally('https://example.com')).toBe(false);
  });

  it('forgets what it trusted when asked', () => {
    refuse('https://127.0.0.1:8443/');
    forgetCertificateExceptions();
    expect(trustedLocally('https://127.0.0.1:8443')).toBe(false);
  });
});

describe('continuing past a refused certificate', () => {
  function refuse(url: string, fingerprint = 'sha256/one', error = 'net::ERR_CERT_AUTHORITY_INVALID') {
    let trusted: boolean | null = null;
    registered?.(
      { preventDefault: () => {} },
      { id: 7 },
      url,
      error,
      { fingerprint },
      (answer) => (trusted = answer),
    );
    return trusted;
  }

  beforeEach(() => {
    forgetCertificateExceptions();
    watchCertificateErrors();
  });

  it('accepts the certificate the person saw, once they choose to', () => {
    expect(refuse('https://intranet.example/')).toBe(false);
    expect(canAcceptRefused(7, 'https://intranet.example/page')).toBe(true);
    expect(acceptRefused(7, 'https://intranet.example/page')).toBe(true);

    expect(refuse('https://intranet.example/')).toBe(true);
    expect(exceptionFor('https://intranet.example')).toBe('accepted');
  });

  // A different certificate on the same site is a new question, not the old answer.
  it('does not accept a different certificate on the same site', () => {
    refuse('https://intranet.example/');
    acceptRefused(7, 'https://intranet.example/');
    expect(refuse('https://intranet.example/', 'sha256/two')).toBe(false);
  });

  it('accepts nothing for another site', () => {
    refuse('https://intranet.example/');
    expect(acceptRefused(7, 'https://other.example/')).toBe(false);
    expect(exceptionFor('https://other.example')).toBeNull();
  });

  it('never accepts a certificate its authority revoked', () => {
    refuse('https://revoked.example/', 'sha256/one', 'net::ERR_CERT_REVOKED');
    expect(canAcceptRefused(7, 'https://revoked.example/')).toBe(false);
    expect(acceptRefused(7, 'https://revoked.example/')).toBe(false);
  });

  it('forgets what was accepted when browsing data is cleared', () => {
    refuse('https://intranet.example/');
    acceptRefused(7, 'https://intranet.example/');
    forgetCertificateExceptions();
    expect(refuse('https://intranet.example/')).toBe(false);
  });
});
