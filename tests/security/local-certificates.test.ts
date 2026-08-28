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

const { allowLocalCertificates, forgetLocalCertificates, mayTrustLocally, trustedLocally } =
  await import('../../electron/main/security/local-certificates');

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
  function refuse(url: string) {
    let prevented = false;
    let trusted: boolean | null = null;
    registered?.(
      { preventDefault: () => (prevented = true) },
      null,
      url,
      'net::ERR_CERT_AUTHORITY_INVALID',
      null,
      (answer) => (trusted = answer),
    );
    return { prevented, trusted };
  }

  beforeEach(() => {
    forgetLocalCertificates();
    allowLocalCertificates();
  });

  it('overrides the refusal for a server on this machine', () => {
    expect(refuse('https://localhost:3000/app')).toEqual({ prevented: true, trusted: true });
  });

  // Chromium already said no, and it stays no.
  it('leaves the refusal standing for anywhere else', () => {
    expect(refuse('https://example.com/')).toEqual({ prevented: false, trusted: false });
    expect(refuse('https://localhost.example.com/')).toEqual({ prevented: false, trusted: false });
  });

  it('remembers the host so the badge can stop claiming the certificate was checked', () => {
    refuse('https://localhost:3000/app');
    expect(trustedLocally('localhost')).toBe(true);
  });

  it('remembers nothing about a host it refused', () => {
    refuse('https://example.com/');
    expect(trustedLocally('example.com')).toBe(false);
  });

  it('forgets what it trusted when asked', () => {
    refuse('https://127.0.0.1:8443/');
    forgetLocalCertificates();
    expect(trustedLocally('127.0.0.1')).toBe(false);
  });
});
