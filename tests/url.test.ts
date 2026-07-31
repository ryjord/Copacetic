import { describe, expect, it } from 'vitest';
import {
  buildSearchUrl,
  isLoopbackHost,
  isNavigableUrl,
  resolveOmniboxInput,
  splitUrlForDisplay,
} from '../electron/shared/url';

const resolve = (input: string, options?: { httpsFirst?: boolean }) =>
  resolveOmniboxInput(input, 'duckduckgo', options);

describe('resolveOmniboxInput', () => {
  it('returns null for empty input', () => {
    expect(resolve('')).toBeNull();
    expect(resolve('   ')).toBeNull();
  });

  describe('addresses', () => {
    it.each([
      ['example.com', 'https://example.com/'],
      ['github.com/ryjord', 'https://github.com/ryjord'],
      ['sub.domain.co.uk/path?q=1', 'https://sub.domain.co.uk/path?q=1'],
      ['https://example.com', 'https://example.com/'],
      ['192.168.1.1', 'https://192.168.1.1/'],
    ])('treats %s as an address', (input, expected) => {
      expect(resolve(input)).toEqual({ type: 'url', target: expected });
    });

    it('keeps loopback on http, because a dev server rarely has a certificate', () => {
      expect(resolve('localhost:3000')).toEqual({ type: 'url', target: 'http://localhost:3000/' });
      expect(resolve('127.0.0.1:8080')).toEqual({ type: 'url', target: 'http://127.0.0.1:8080/' });
      expect(resolve('localhost')).toEqual({ type: 'url', target: 'http://localhost/' });
    });

    it('does not mistake a port for a scheme', () => {
      // `localhost:3000` parses as scheme `localhost:` if you are not careful.
      expect(resolve('localhost:3000')?.type).toBe('url');
      expect(resolve('example.com:8443')?.type).toBe('url');
    });
  });

  describe('searches', () => {
    it.each(['hello world', 'what is a public suffix list', 'react', 'copacetic browser', '1.2.3', 'file'])(
      'treats %s as a search',
      (input) => {
        expect(resolve(input)).toMatchObject({ type: 'search', query: input });
      },
    );

    it('prefers searching when the input is ambiguous', () => {
      // Guessing "address" loses the query behind a DNS error page; guessing
      // "search" costs one keystroke.
      expect(resolve('not a domain')?.type).toBe('search');
    });
  });

  describe('dangerous schemes', () => {
    it.each([
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'blob:https://example.com/uuid',
      'filesystem:https://example.com/temporary/x',
    ])('never navigates to %s', (input) => {
      const result = resolve(input);
      expect(result?.type).toBe('search');
      expect(result?.target.startsWith('https://duckduckgo.com/')).toBe(true);
    });
  });

  describe('httpsFirst', () => {
    it('upgrades an explicit http address when enabled', () => {
      expect(resolve('http://example.com', { httpsFirst: true })).toEqual({
        type: 'url',
        target: 'https://example.com/',
      });
    });

    it('leaves an explicit http address alone when disabled', () => {
      expect(resolve('http://example.com', { httpsFirst: false })).toEqual({
        type: 'url',
        target: 'http://example.com/',
      });
    });

    it('never upgrades loopback, which has no certificate', () => {
      expect(resolve('http://localhost:3000', { httpsFirst: true })).toEqual({
        type: 'url',
        target: 'http://localhost:3000/',
      });
    });
  });
});

describe('splitUrlForDisplay', () => {
  it('isolates the registrable domain so a lookalike host cannot hide', () => {
    // The whole point: this must read as `attacker.net`, not as PayPal.
    expect(splitUrlForDisplay('https://paypal.com.attacker.net/login')).toEqual({
      scheme: 'https',
      subdomain: 'paypal.com.',
      registrableDomain: 'attacker.net',
      path: '/login',
      isInternal: false,
    });
  });

  it('handles compound public suffixes', () => {
    expect(splitUrlForDisplay('https://www.bbc.co.uk/news')).toMatchObject({
      subdomain: 'www.',
      registrableDomain: 'bbc.co.uk',
      path: '/news',
    });
  });

  it('leaves IP addresses and dotless hosts whole', () => {
    expect(splitUrlForDisplay('http://192.168.0.1:8080/')).toMatchObject({
      registrableDomain: '192.168.0.1',
      subdomain: '',
      path: ':8080',
    });
    expect(splitUrlForDisplay('http://localhost:3000/')).toMatchObject({
      registrableDomain: 'localhost',
      subdomain: '',
    });
  });

  it('drops a bare trailing slash so the path column stays quiet', () => {
    expect(splitUrlForDisplay('https://example.com/')).toMatchObject({ path: '' });
  });

  it('returns null for anything unparseable', () => {
    expect(splitUrlForDisplay('not a url')).toBeNull();
  });
});

describe('isNavigableUrl', () => {
  it.each(['https://example.com', 'http://example.com', 'file:///tmp/x', 'copacetic://start'])('allows %s', (url) =>
    expect(isNavigableUrl(url)).toBe(true),
  );

  it.each(['javascript:alert(1)', 'data:text/html,x', 'blob:https://x/y', 'chrome://settings', 'nonsense'])(
    'blocks %s',
    (url) => expect(isNavigableUrl(url)).toBe(false),
  );
});

describe('isLoopbackHost', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]', 'api.localhost'])('recognises %s', (host) =>
    expect(isLoopbackHost(host)).toBe(true),
  );

  it.each(['example.com', '128.0.0.1', 'notlocalhost'])('rejects %s', (host) =>
    expect(isLoopbackHost(host)).toBe(false),
  );
});

describe('buildSearchUrl', () => {
  it('encodes the query', () => {
    expect(buildSearchUrl('a b&c', 'duckduckgo')).toBe('https://duckduckgo.com/?q=a%20b%26c');
  });

  it('falls back to the default engine for an unknown id', () => {
    expect(buildSearchUrl('x', 'nope' as never)).toContain('duckduckgo.com');
  });
});
