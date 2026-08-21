import { describe, expect, it } from 'vitest';
import { describeSecurity } from '../../electron/main/tabs/tab-security';
import { INTERNAL_SCHEME } from '../../electron/shared/url';

const CERTIFICATE = {
  issuer: "Let's Encrypt",
  subject: 'example.com',
  validFrom: 0,
  validTo: 0,
  fingerprint: 'ab:cd',
  isIssuedByKnownRoot: true,
};

/**
 * This decides what the connection badge claims, and the badge is the one
 * coloured thing in the chrome. Saying "secure" about anything that is not is
 * the worst failure this browser has available to it.
 */
describe('what Copacetic claims about a connection', () => {
  it('calls https secure and carries the certificate through', () => {
    const state = describeSecurity('https://example.com/page', CERTIFICATE);
    expect(state.level).toBe('secure');
    expect(state.host).toBe('example.com');
    expect(state.certificate).toBe(CERTIFICATE);
  });

  it('calls plain http insecure', () => {
    expect(describeSecurity('http://example.com/page').level).toBe('insecure');
  });

  // Loopback never crosses a network, so http to it is not the same claim as
  // http to a host on the internet.
  it.each(['http://localhost:3000/', 'http://127.0.0.1:8080/'])('calls %s secure without a certificate', (url) => {
    const state = describeSecurity(url);
    expect(state.level).toBe('secure');
    expect(state.certificate).toBeNull();
  });

  it('never attaches a certificate to a page that is not https', () => {
    expect(describeSecurity('http://example.com/', CERTIFICATE).certificate).toBeNull();
    expect(describeSecurity('file:///etc/hosts', CERTIFICATE).certificate).toBeNull();
  });

  it.each([
    ['a Copacetic page', 'copacetic://start'],
    ['an about page', 'about:blank'],
    ['a local file', 'file:///home/user/notes.html'],
  ])('calls %s internal rather than secure', (_name, url) => {
    expect(describeSecurity(url).level).toBe('internal');
  });

  // Two schemes that read alike and are not interchangeable: `copacetic:` is
  // what a tab holds, `copacetic-app:` is the origin the chrome itself is
  // served from and never appears as a tab's URL.
  it('describes the tab scheme, not the origin the chrome is served from', () => {
    expect(describeSecurity(`${INTERNAL_SCHEME}://start`).level).toBe('internal');
    expect(INTERNAL_SCHEME).not.toBe('copacetic-app');
  });

  // Anything unparseable must not fall through to a reassuring answer.
  it.each(['', 'not a url', 'http://', '://missing-scheme'])('does not call %o secure', (url) => {
    expect(describeSecurity(url).level).not.toBe('secure');
  });

  it('always gives the panel a sentence to show', () => {
    for (const url of ['https://example.com/', 'http://example.com/', 'file:///tmp/a', 'about:blank', 'nonsense']) {
      expect(describeSecurity(url).detail.length).toBeGreaterThan(0);
    }
  });
});
