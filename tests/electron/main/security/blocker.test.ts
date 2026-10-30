import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ContentBlocker, cookieTokensOf } from '../../../../electron/main/security/blocker';
import { BlockingPolicy } from '../../../../electron/main/security/blocking-policy';

interface CapturedRequest {
  url: string;
  resourceType: string;
  webContentsId?: number;
}

let policy: BlockingPolicy;

/**
 * A stand-in for the slice of `Session` the blocker touches, so the matching
 * rules can be exercised without booting Electron.
 */
function fakeSession() {
  let handler: ((details: CapturedRequest, callback: (response: { cancel: boolean }) => void) => void) | null = null;
  return {
    session: { webRequest: { onBeforeRequest: (fn: typeof handler) => (handler = fn) } },
    request(request: CapturedRequest): boolean {
      let cancelled = false;
      handler?.(request, (response) => (cancelled = response.cancel));
      return cancelled;
    },
  };
}

describe('ContentBlocker', () => {
  let blocker: ContentBlocker;
  let fake: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    blocker = new ContentBlocker();
    fake = fakeSession();
    policy = new BlockingPolicy(true);
    blocker.attach(fake.session as never, policy);
  });

  const ask = (url: string, resourceType = 'script', webContentsId: number | undefined = 7) =>
    fake.request({ url, resourceType, webContentsId });

  // `notdoubleclick.net` is a different registrable domain.
  // `doubleclick.net.` is a fully-qualified name that resolves identically, and `new URL().hostname` keeps the dot, so one character must not walk past the list.
  it.each([
    ['a listed tracker domain', 'https://www.google-analytics.com/collect', true],
    ['another listed tracker domain', 'https://connect.facebook.net/en_US/fbevents.js', true],
    ['a subdomain of a listed domain', 'https://region1.analytics.google.com/g/collect', true],
    ['a deeply nested subdomain', 'https://deep.nested.doubleclick.net/x.gif', true],
    ['a domain that merely ends with the same letters', 'https://notdoubleclick.net/a.js', false],
    ['another domain ending with the same letters', 'https://mycriteo.com/a.js', false],
    ['an ordinary request', 'https://example.com/app.js', false],
    ['an ordinary request to a CDN', 'https://cdn.jsdelivr.net/npm/thing.js', false],
    ['a tracker written with a trailing dot', 'https://doubleclick.net./pixel.gif', true],
    ['a tracker subdomain written with a trailing dot', 'https://ads.doubleclick.net./pixel.gif', true],
    ['an unrelated fully-qualified host', 'https://example.com./app.js', false],
  ])('treats %s as blocked or not as expected', (_label, url, isBlocked) => {
    expect(ask(url)).toBe(isBlocked);
  });

  it('never blocks a top-level navigation, so a tracker domain stays visitable', () => {
    expect(ask('https://www.google-analytics.com/', 'mainFrame')).toBe(false);
  });

  it('does nothing at all when disabled', () => {
    policy.setEnabled(false);
    expect(ask('https://www.google-analytics.com/collect')).toBe(false);
  });

  it('ignores a URL it cannot parse', () => {
    expect(ask('not a url')).toBe(false);
  });

  describe('per-tab counting', () => {
    it('counts blocked requests against the requesting tab', () => {
      ask('https://www.google-analytics.com/collect', 'script', 7);
      ask('https://connect.facebook.net/x.js', 'script', 7);
      ask('https://criteo.com/x.js', 'script', 9);

      expect(blocker.countFor(7)).toBe(2);
      expect(blocker.countFor(9)).toBe(1);
      expect(blocker.countFor(11)).toBe(0);
    });

    it('still blocks when the request has no owning tab', () => {
      // Service workers and some prefetches arrive without a webContentsId.
      expect(ask('https://www.google-analytics.com/collect', 'script', undefined)).toBe(true);
    });

    it('reports a reset to listeners so the chrome clears its badge', () => {
      const listener = vi.fn();
      blocker.onCount(listener);
      ask('https://www.google-analytics.com/collect', 'script', 7);
      expect(listener).toHaveBeenLastCalledWith(7, 1);

      blocker.resetCount(7);
      expect(blocker.countFor(7)).toBe(0);
      expect(listener).toHaveBeenLastCalledWith(7, 0);
    });

    // One per window: a second window's tabs used to take the count from the first's.
    it('tells every listener, and stops telling one that unsubscribed', () => {
      const firstWindow = vi.fn();
      const secondWindow = vi.fn();
      const stopFirst = blocker.onCount(firstWindow);
      blocker.onCount(secondWindow);
      ask('https://www.google-analytics.com/collect', 'script', 7);
      expect(firstWindow).toHaveBeenLastCalledWith(7, 1);
      expect(secondWindow).toHaveBeenLastCalledWith(7, 1);

      stopFirst();
      ask('https://www.google-analytics.com/collect', 'script', 7);
      expect(firstWindow).toHaveBeenCalledTimes(1);
      expect(secondWindow).toHaveBeenLastCalledWith(7, 2);
    });
  });
});

// One blocker holds the lists for every profile; what each profile chose must stay with that profile.
describe('one blocker shared by two profiles', () => {
  it("follows each session's own profile", () => {
    const blocker = new ContentBlocker();
    const blocking = fakeSession();
    const notBlocking = fakeSession();
    blocker.attach(blocking.session as never, new BlockingPolicy(true));
    blocker.attach(notBlocking.session as never, new BlockingPolicy(false));
    const tracker = { url: 'https://www.google-analytics.com/collect', resourceType: 'script', webContentsId: 7 };
    expect(blocking.request(tracker)).toBe(true);
    expect(notBlocking.request(tracker)).toBe(false);
  });

  it("keeps one profile's exception off the other's pages", () => {
    const blocker = new ContentBlocker();
    const allowing = fakeSession();
    const other = fakeSession();
    blocker.attach(allowing.session as never, new BlockingPolicy(true, ['example.com']));
    blocker.attach(other.session as never, new BlockingPolicy(true));
    blocker.setPageSite(7, 'example.com');
    blocker.setPageSite(9, 'example.com');
    expect(
      allowing.request({ url: 'https://doubleclick.net/pixel.gif', resourceType: 'script', webContentsId: 7 }),
    ).toBe(false);
    expect(
      other.request({ url: 'https://doubleclick.net/pixel.gif', resourceType: 'script', webContentsId: 9 }),
    ).toBe(true);
  });
});

describe('the connection log', () => {
  let blocker: ContentBlocker;
  let fake: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    blocker = new ContentBlocker();
    fake = fakeSession();
    policy = new BlockingPolicy(true);
    blocker.attach(fake.session as never, policy);
  });

  const ask = (url: string, resourceType = 'script', webContentsId: number | undefined = 7) =>
    fake.request({ url, resourceType, webContentsId });

  it('records hosts that were allowed through, not only blocked ones, and counts repeat requests', () => {
    ask('https://example.com/a.js');
    ask('https://example.com/b.js');
    ask('https://example.com/c.js');
    ask('https://cdn.example.net/lib.js');
    ask('https://www.google-analytics.com/collect');

    const connections = blocker.connectionsFor(7);
    expect(connections.map((entry) => entry.host)).toEqual(
      expect.arrayContaining(['example.com', 'cdn.example.net', 'www.google-analytics.com']),
    );
    expect(connections).toContainEqual(expect.objectContaining({ host: 'example.com', requests: 3, blocked: 0 }));
  });

  it('separates what was blocked from what merely was a tracker', () => {
    ask('https://www.google-analytics.com/collect');
    // Top-level navigation to a tracker is deliberately never blocked.
    ask('https://www.google-analytics.com/page', 'mainFrame');

    const entry = blocker.connectionsFor(7).find((candidate) => candidate.host === 'www.google-analytics.com');
    expect(entry).toMatchObject({ requests: 2, blocked: 1, isTracker: true });
  });

  it('still records hosts when blocking is switched off', () => {
    policy.setEnabled(false);
    ask('https://www.google-analytics.com/collect');

    expect(blocker.connectionsFor(7)).toContainEqual(
      expect.objectContaining({ host: 'www.google-analytics.com', blocked: 0, isTracker: true }),
    );
  });

  it('puts blocked hosts first, then the busiest', () => {
    ask('https://quiet.example.com/a.js');
    ask('https://busy.example.com/a.js');
    ask('https://busy.example.com/b.js');
    ask('https://doubleclick.net/pixel.gif');

    expect(blocker.connectionsFor(7).map((entry) => entry.host)).toEqual([
      'doubleclick.net',
      'busy.example.com',
      'quiet.example.com',
    ]);
  });

  // The previous page's hosts say nothing about this one.
  it('starts a fresh log on a new page load', () => {
    ask('https://example.com/a.js');
    blocker.resetCount(7);

    expect(blocker.connectionsFor(7)).toEqual([]);
  });

  it('forgets everything when the tab closes', () => {
    ask('https://example.com/a.js');
    ask('https://www.google-analytics.com/collect');
    expect(blocker.countFor(7)).toBe(1);
    blocker.forget(7);

    expect(blocker.countFor(7)).toBe(0);
    expect(blocker.connectionsFor(7)).toEqual([]);
  });

  it('keeps tabs separate', () => {
    ask('https://one.example.com/a.js', 'script', 7);
    ask('https://two.example.com/a.js', 'script', 9);

    expect(blocker.connectionsFor(7).map((e) => e.host)).toEqual(['one.example.com']);
    expect(blocker.connectionsFor(9).map((e) => e.host)).toEqual(['two.example.com']);
  });

  it('is bounded, so endless subdomains cannot grow it without limit', () => {
    for (let i = 0; i < 400; i += 1) {
      ask(`https://sub${i}.example.com/a.js`);
    }
    expect(blocker.connectionsFor(7).length).toBeLessThanOrEqual(250);
  });
});

describe('per-site exceptions', () => {
  let blocker: ContentBlocker;
  let fake: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    blocker = new ContentBlocker();
    fake = fakeSession();
    policy = new BlockingPolicy(true);
    blocker.attach(fake.session as never, policy);
    blocker.setPageSite(7, 'example.com');
  });

  const ask = (url: string, webContentsId = 7) => fake.request({ url, resourceType: 'script', webContentsId });

  it('blocks a tracker on a site with no exception, stops on a site the user allowed, and blocks again once it is taken back', () => {
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);

    policy.setAllowlist(['example.com']);
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(false);

    policy.setAllowlist([]);
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  // The exception is about the page you are on, not the tracker itself.
  it('does not carry the exception to another site', () => {
    policy.setAllowlist(['example.com']);
    blocker.setPageSite(9, 'other.com');
    expect(ask('https://doubleclick.net/pixel.gif', 9)).toBe(true);
  });

  it('still records what was allowed through, so the log stays honest', () => {
    policy.setAllowlist(['example.com']);
    ask('https://doubleclick.net/pixel.gif');

    expect(blocker.connectionsFor(7)).toContainEqual(
      expect.objectContaining({ host: 'doubleclick.net', isTracker: true, blocked: 0 }),
    );
  });

  it('blocks normally when the page site is unknown', () => {
    policy.setAllowlist(['example.com']);
    blocker.setPageSite(7, '');
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });
});

/**
 * Fetching the lists again.
 *
 * The failure that matters is not a fetch that errors - that is loud. It is a
 * list that arrives short: it parses, it loads, and it silently blocks less
 * than the one it replaced. Nothing downstream can tell, so this refuses the
 * whole update rather than accept part of one.
 */
describe('updating the filter lists', () => {
  const realList = (rules: number) =>
    `[Adblock Plus 2.0]\n! Last modified: 03 Sep 2026 09:00 UTC\n${Array.from({ length: rules }, (_, index) => `||tracker${index}.example^`).join('\n')}\n${'! padding\n'.repeat(12_000)}`;

  const blockerWithLists = () => {
    const blocker = new ContentBlocker();
    // Pretend a release shipped with these, which is what names the sources.
    (blocker as unknown as { lists: unknown[] }).lists = [
      {
        name: 'easylist',
        url: 'https://easylist.to/easylist/easylist.txt',
        describe: 'Ads',
        rules: 1,
        lastModified: 'old',
      },
    ];
    return blocker;
  };

  it('takes a list that arrives whole', async () => {
    const blocker = blockerWithLists();
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-filters-'));
    const outcome = await blocker.fetchNewerLists(directory, async () => realList(500));

    expect(outcome.ok).toBe(true);
    expect(existsSync(path.join(directory, 'filters', 'engine.bin'))).toBe(true);
  });

  // The dangerous one: short enough to be wrong, whole enough to parse.
  // The dangerous one: short enough to be wrong, whole enough to parse. The other is not a filter list at all.
  it.each([
    ['arrives short', '[Adblock Plus 2.0]\n||one.example^'],
    ['is not a filter list at all', 'x'.repeat(200_000)],
  ])('refuses a list that %s, and changes nothing', async (_label, body) => {
    const blocker = blockerWithLists();
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-filters-'));
    const outcome = await blocker.fetchNewerLists(directory, async () => body);

    expect(outcome.ok).toBe(false);
    expect(existsSync(path.join(directory, 'filters', 'engine.bin'))).toBe(false);
  });

  it('says which list could not be reached, rather than failing silently', async () => {
    const blocker = blockerWithLists();
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-filters-'));
    const outcome = await blocker.fetchNewerLists(directory, async () => {
      throw new Error('offline');
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain('easylist');
  });

  it('will not update lists it was never given', async () => {
    const blocker = new ContentBlocker();
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-filters-'));
    const outcome = await blocker.fetchNewerLists(directory, async () => realList(500));
    expect(outcome.ok).toBe(false);
  });
});

describe('hiding cookie banners', () => {
  const padding = '! padding\n'.repeat(12_000);
  const adList = `[Adblock Plus 2.0]\n${Array.from({ length: 500 }, (_unused, index) => `||tracker${index}.example^`).join('\n')}\n${padding}`;
  const cookieList = `[Adblock Plus 2.0]\n##.cookie-notice\n###onetrust-banner-sdk\nquiet.example#@##onetrust-banner-sdk\n${padding}`;

  const loadedBlocker = async () => {
    const blocker = new ContentBlocker();
    (blocker as unknown as { lists: unknown[] }).lists = [
      { name: 'easylist', url: 'https://lists.example/ads.txt', describe: 'Ads', rules: 1, lastModified: 'old' },
      {
        name: 'easylist-cookie',
        url: 'https://lists.example/cookies.txt',
        describe: 'Banners',
        rules: 1,
        lastModified: 'old',
        purpose: 'cookie-banners',
      },
    ];
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-banners-'));
    const outcome = await blocker.fetchNewerLists(directory, async (url) =>
      url.endsWith('cookies.txt') ? cookieList : adList,
    );
    expect(outcome.ok).toBe(true);
    const fake = fakeSession();
    blocker.attach(fake.session as never, new BlockingPolicy(true));
    return { blocker, session: fake.session as never, directory };
  };

  it('names the ids and classes a list hides everywhere, and nothing scoped to one site', () => {
    const tokens = cookieTokensOf('###banner\n##.notice\nsite.example##.only-here\n! ##.comment');
    expect(tokens).toEqual({ ids: ['banner'], classes: ['notice'] });
  });

  it('hides a known banner when asked to, and not otherwise', async () => {
    const { blocker, session } = await loadedBlocker();
    expect(blocker.cosmeticStylesFor('https://news.example/', session, true)).toContain('#onetrust-banner-sdk');
    expect(blocker.cosmeticStylesFor('https://news.example/', session, false)).not.toContain('#onetrust-banner-sdk');
  });

  it("keeps a site's own exception", async () => {
    const { blocker, session } = await loadedBlocker();
    expect(blocker.cosmeticStylesFor('https://quiet.example/', session, true)).not.toContain('#onetrust-banner-sdk');
  });

  it('writes what a later start needs to hide banners the same way', async () => {
    const { directory } = await loadedBlocker();
    const restarted = new ContentBlocker();
    restarted.loadShippedLists(path.join(directory, 'filters'));
    const fake = fakeSession();
    restarted.attach(fake.session as never, new BlockingPolicy(true));
    expect(restarted.cosmeticStylesFor('https://news.example/', fake.session as never, true)).toContain(
      '#onetrust-banner-sdk',
    );
  });

  it('takes the cookie list from what shipped when the fetched lists predate it', async () => {
    const { directory: shipped } = await loadedBlocker();
    const fetchedBefore = mkdtempSync(path.join(tmpdir(), 'copacetic-banners-'));
    const older = new ContentBlocker();
    (older as unknown as { lists: unknown[] }).lists = [
      { name: 'easylist', url: 'https://lists.example/ads.txt', describe: 'Ads', rules: 1, lastModified: 'old' },
    ];
    expect((await older.fetchNewerLists(fetchedBefore, async () => adList)).ok).toBe(true);

    const restarted = new ContentBlocker();
    restarted.loadShippedLists(path.join(fetchedBefore, 'filters'));
    restarted.adoptListsMissingFrom(path.join(shipped, 'filters'));
    const fake = fakeSession();
    restarted.attach(fake.session as never, new BlockingPolicy(true));

    expect(restarted.cosmeticStylesFor('https://news.example/', fake.session as never, true)).toContain(
      '#onetrust-banner-sdk',
    );
    expect(restarted.loadedLists().map((list) => list.name)).toEqual(['easylist', 'easylist-cookie']);
  });
});

describe("an extension's rules in the blocker", () => {
  const judged = (appliesExtensionRules: boolean, verdict: ReturnType<BlockingPolicy['extensionVerdictFor']>) => {
    const blocker = new ContentBlocker();
    const fake = fakeSession();
    const owned = new BlockingPolicy(true);
    owned.setExtensionJudge(() => verdict);
    blocker.attach(fake.session as never, owned, appliesExtensionRules);
    return fake.request({ url: 'https://example.com/app.js', resourceType: 'script', webContentsId: 7 });
  };

  it('stop a request Copacetic would let through', () => {
    expect(judged(true, { kind: 'block' })).toBe(true);
  });

  // Extensions never run in Hush, so neither do their rules, whatever the profile's extensions say.
  it('are never asked in a session that runs no extensions', () => {
    expect(judged(false, { kind: 'block' })).toBe(false);
  });

  it('leave Copacetic to judge what they have nothing to say about', () => {
    expect(judged(true, { kind: 'none' })).toBe(false);
  });
});

describe('filter lists that cannot be read', () => {
  // Lists fetched on 2.1 stopped loading under a newer engine, and nothing anywhere said so.
  it('says why when lists are there but will not load, and blocks without them', async () => {
    const diagnostics = await import('../../../../electron/main/system/diagnostics');
    const warn = vi.spyOn(diagnostics.log, 'warn');
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-unreadable-'));
    writeFileSync(path.join(directory, 'engine.bin'), 'not an engine');
    writeFileSync(path.join(directory, 'manifest.json'), '{"lists":[]}');

    expect(new ContentBlocker().loadShippedLists(directory)).toBeNull();
    expect(warn).toHaveBeenCalledWith('filter lists on disk could not be read and are not in use', expect.anything());
    warn.mockRestore();
  });

  it('says nothing when no lists were ever fetched, which is the usual case', async () => {
    const diagnostics = await import('../../../../electron/main/system/diagnostics');
    const warn = vi.spyOn(diagnostics.log, 'warn');
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-never-fetched-'));

    expect(new ContentBlocker().loadShippedLists(path.join(directory, 'filters'))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
