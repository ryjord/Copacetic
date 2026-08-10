import { describe, expect, it } from 'vitest';
import {
  buildSearchUrl,
  isFetchableFavicon,
  isLoopbackHost,
  isNavigableUrl,
  isPageNavigableUrl,
  isPrivateHost,
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

describe('isPageNavigableUrl', () => {
  it('allows the schemes a page may legitimately send a tab to', () => {
    expect(isPageNavigableUrl('https://example.com')).toBe(true);
    expect(isPageNavigableUrl('http://example.com')).toBe(true);
    expect(isPageNavigableUrl('copacetic://start')).toBe(true);
  });

  // The split that matters: a user typing a local path means it, a page
  // saying `window.open('file:///…')` does not.
  it('refuses file: even though a typed address may use it', () => {
    expect(isNavigableUrl('file:///Users/someone/Desktop/notes.txt')).toBe(true);
    expect(isPageNavigableUrl('file:///Users/someone/Desktop/notes.txt')).toBe(false);
    expect(isPageNavigableUrl('file:///etc/passwd')).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://example.com/x',
    'vbscript:msgbox',
    'filesystem:https://example.com/temporary/x',
  ])('refuses %s', (url) => {
    expect(isPageNavigableUrl(url)).toBe(false);
    expect(isNavigableUrl(url)).toBe(false);
  });

  it('refuses anything that is not a URL at all', () => {
    expect(isPageNavigableUrl('')).toBe(false);
    expect(isPageNavigableUrl('not a url')).toBe(false);
  });
});

describe('isPrivateHost', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['localhost', 'loopback by name'],
    ['10.1.2.3', 'RFC1918 class A'],
    ['172.16.0.1', 'RFC1918 class B, lower bound'],
    ['172.31.255.254', 'RFC1918 class B, upper bound'],
    ['192.168.0.1', 'RFC1918 class C'],
    ['169.254.169.254', 'link-local, where cloud metadata lives'],
    ['0.0.0.0', 'unspecified'],
    ['printer.local', 'mDNS'],
    ['db.internal', 'conventional internal suffix'],
    ['fd00::1', 'IPv6 unique-local'],
    ['fe80::1', 'IPv6 link-local'],
  ])('treats %s as private (%s)', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each(['example.com', '8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '2606:4700::1111'])(
    'treats %s as public',
    (host) => {
      expect(isPrivateHost(host)).toBe(false);
    },
  );
});

describe('isFetchableFavicon', () => {
  it('allows a site to serve its icon from its own origin or a CDN', () => {
    expect(isFetchableFavicon('https://example.com/page', 'https://example.com/favicon.ico')).toBe(true);
    expect(isFetchableFavicon('https://github.com/x', 'https://githubassets.com/favicon.ico')).toBe(true);
  });

  // The reason this function exists: the fetch runs in the web session, with
  // whatever cookies the user holds for the host it names.
  it.each([
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://192.168.1.1/admin/',
    'http://127.0.0.1:8080/',
    'http://router.local/status',
  ])('refuses a remote page pointing at %s', (faviconUrl) => {
    expect(isFetchableFavicon('https://attacker.example/page', faviconUrl)).toBe(false);
  });

  it('still lets a local page load its own local icon', () => {
    expect(isFetchableFavicon('http://localhost:3000/', 'http://localhost:3000/favicon.ico')).toBe(true);
  });

  it('refuses schemes that are not a real network fetch', () => {
    expect(isFetchableFavicon('https://example.com/', 'file:///etc/passwd')).toBe(false);
    expect(isFetchableFavicon('https://example.com/', 'javascript:alert(1)')).toBe(false);
    expect(isFetchableFavicon('https://example.com/', 'nonsense')).toBe(false);
  });
});

describe('splitUrlForDisplay with the real suffix list', () => {
  const emphasised = (url: string) => splitUrlForDisplay(url)?.registrableDomain;

  // The whole point of the address bar: the part at full contrast must be the
  // part that tells you who you are actually talking to.
  it('reads a lookalike host as its real owner', () => {
    expect(emphasised('https://paypal.com.attacker.tld/login')).toBe('attacker.tld');
    expect(emphasised('https://www.google.com.evil.co.uk/')).toBe('evil.co.uk');
    expect(emphasised('https://accounts.google.com.phish.github.io/')).toBe('phish.github.io');
  });

  // Cases the hand-written list of about forty suffixes got wrong.
  it.each([
    ['https://example.pvt.k12.ma.us/', 'example.pvt.k12.ma.us'],
    ['https://user.github.io/repo', 'user.github.io'],
    ['https://app.vercel.app/', 'app.vercel.app'],
    ['https://thing.s3.amazonaws.com/', 'thing.s3.amazonaws.com'],
    ['https://site.co.uk/page', 'site.co.uk'],
    ['https://sub.site.co.uk/page', 'site.co.uk'],
    ['https://a.b.c.example.com/', 'example.com'],
  ])('emphasises the registrable domain of %s', (url, expected) => {
    expect(emphasised(url)).toBe(expected);
  });

  // Two different projects on a shared host are different sites, and used to
  // read as the same one.
  it('does not make two hosts on a shared suffix look like the same site', () => {
    expect(emphasised('https://alice.github.io/')).not.toBe(emphasised('https://mallory.github.io/'));
  });

  it('emphasises the whole host when nobody owns it', () => {
    expect(emphasised('https://co.uk/')).toBe('co.uk');
  });

  it('leaves addresses without a registrable domain alone', () => {
    expect(emphasised('https://192.168.0.1/')).toBe('192.168.0.1');
    expect(emphasised('http://localhost:3000/')).toBe('localhost');
  });
});
