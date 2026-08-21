import { describe, expect, it } from 'vitest';
import { describeAuthPrompt, isPromptWorthy, sanitiseRealm } from '../../electron/main/security/auth';

describe('which challenges are worth asking about', () => {
  it('always asks for a proxy, whatever the page is', () => {
    expect(isPromptWorthy({ isProxy: true, challengeUrl: 'http://proxy.local/', tabUrl: null })).toBe(true);
    expect(
      isPromptWorthy({ isProxy: true, challengeUrl: 'http://proxy.local/', tabUrl: 'https://example.com/' }),
    ).toBe(true);
  });

  it('asks when the challenge comes from the site the address bar is showing', () => {
    expect(
      isPromptWorthy({
        isProxy: false,
        challengeUrl: 'https://intranet.example/reports',
        tabUrl: 'https://intranet.example/',
      }),
    ).toBe(true);
  });

  // The window would say one site while the password went to another. This is
  // the phishing route Chromium stopped prompting for as well.
  it.each([
    ['https://cdn.other-site.example/img.png', 'https://example.com/'],
    ['http://example.com/thing', 'https://example.com/'],
    ['https://sub.example.com/thing', 'https://example.com/'],
    ['https://example.com:8443/thing', 'https://example.com/'],
  ])('refuses a challenge from %s while the page is %s', (challengeUrl, tabUrl) => {
    expect(isPromptWorthy({ isProxy: false, challengeUrl, tabUrl })).toBe(false);
  });

  it('refuses when there is no page to compare against', () => {
    expect(isPromptWorthy({ isProxy: false, challengeUrl: 'https://example.com/', tabUrl: null })).toBe(false);
  });

  it('refuses when either side is not a URL', () => {
    expect(isPromptWorthy({ isProxy: false, challengeUrl: 'nonsense', tabUrl: 'https://example.com/' })).toBe(false);
    expect(isPromptWorthy({ isProxy: false, challengeUrl: 'https://example.com/', tabUrl: 'nonsense' })).toBe(false);
  });
});

describe('sanitiseRealm', () => {
  // The realm is the one piece of server-chosen text shown inside Copacetic's
  // own window, so it must not be able to draw anything resembling UI.
  it('strips control characters and bidirectional overrides', () => {
    expect(sanitiseRealm(`Reports\u0000\u001f`)).toBe(`Reports`);
    expect(sanitiseRealm(`Reports\u202egnihsihp`)).toBe(`Reportsgnihsihp`);
  });

  it('collapses newlines so a realm cannot break out of its line', () => {
    expect(sanitiseRealm('Line one\nLine two')).toBe('Line one Line two');
    expect(sanitiseRealm('  spaced   out  ')).toBe('spaced out');
  });

  it('caps a realm long enough to push the buttons off screen', () => {
    const result = sanitiseRealm('x'.repeat(500));
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves an ordinary realm intact', () => {
    expect(sanitiseRealm('Restricted Area')).toBe('Restricted Area');
    expect(sanitiseRealm('')).toBe('');
  });
});

describe('describeAuthPrompt', () => {
  const base = { id: 'a', tabId: 't', isProxy: false, host: 'example.com', realm: 'Reports', scheme: 'basic' };

  it('hides the port when it is the default for the scheme', () => {
    expect(describeAuthPrompt({ ...base, port: 443 }).host).toBe('example.com');
    expect(describeAuthPrompt({ ...base, port: 80 }).host).toBe('example.com');
  });

  it('shows a non-default port, since it is part of who is asking', () => {
    expect(describeAuthPrompt({ ...base, port: 8443 }).host).toBe('example.com:8443');
  });

  it('carries the sanitised realm rather than the raw one', () => {
    expect(describeAuthPrompt({ ...base, port: 443, realm: `Reports\u202ex` }).realm).toBe(`Reportsx`);
  });
});
