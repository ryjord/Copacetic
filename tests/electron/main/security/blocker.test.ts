import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ContentBlocker } from '../../../../electron/main/security/blocker';
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

  it('blocks a listed tracker domain', () => {
    expect(ask('https://www.google-analytics.com/collect')).toBe(true);
    expect(ask('https://connect.facebook.net/en_US/fbevents.js')).toBe(true);
  });

  it('blocks subdomains of a listed domain', () => {
    expect(ask('https://region1.analytics.google.com/g/collect')).toBe(true);
    expect(ask('https://deep.nested.doubleclick.net/x.gif')).toBe(true);
  });

  it('does not block a domain that merely ends with the same letters', () => {
    // `notdoubleclick.net` is a different registrable domain.
    expect(ask('https://notdoubleclick.net/a.js')).toBe(false);
    expect(ask('https://mycriteo.com/a.js')).toBe(false);
  });

  it('leaves ordinary requests alone', () => {
    expect(ask('https://example.com/app.js')).toBe(false);
    expect(ask('https://cdn.jsdelivr.net/npm/thing.js')).toBe(false);
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

    it('forgets a tab entirely when it closes', () => {
      ask('https://www.google-analytics.com/collect', 'script', 7);
      blocker.forget(7);
      expect(blocker.countFor(7)).toBe(0);
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

describe('ContentBlocker, fully-qualified hostnames', () => {
  let fake: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    const blocker = new ContentBlocker();
    fake = fakeSession();
    policy = new BlockingPolicy(true);
    blocker.attach(fake.session as never, policy);
  });

  const ask = (url: string) => fake.request({ url, resourceType: 'script', webContentsId: 7 });

  // `doubleclick.net.` is a fully-qualified name that resolves identically to
  // `doubleclick.net`, and `new URL().hostname` keeps the dot. One character
  // should not be enough to walk past the whole list.
  it('blocks a tracker written with a trailing dot', () => {
    expect(ask('https://doubleclick.net./pixel.gif')).toBe(true);
    expect(ask('https://ads.doubleclick.net./pixel.gif')).toBe(true);
  });

  it('still lets an unrelated fully-qualified host through', () => {
    expect(ask('https://example.com./app.js')).toBe(false);
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

  it('records hosts that were allowed through, not only blocked ones', () => {
    ask('https://example.com/app.js');
    ask('https://cdn.example.net/lib.js');
    ask('https://www.google-analytics.com/collect');

    const hosts = blocker.connectionsFor(7).map((entry) => entry.host);
    expect(hosts).toContain('example.com');
    expect(hosts).toContain('cdn.example.net');
    expect(hosts).toContain('www.google-analytics.com');
  });

  it('counts repeat requests to the same host', () => {
    ask('https://example.com/a.js');
    ask('https://example.com/b.js');
    ask('https://example.com/c.js');

    expect(blocker.connectionsFor(7)).toContainEqual(
      expect.objectContaining({ host: 'example.com', requests: 3, blocked: 0 }),
    );
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
    blocker.forget(7);

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

  it('blocks a tracker on a site with no exception', () => {
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  it('stops blocking on a site the user allowed', () => {
    policy.setAllowlist(['example.com']);
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(false);
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

  it('can be taken back', () => {
    policy.setAllowlist(['example.com']);
    policy.setAllowlist([]);
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  it('blocks normally when the page site is unknown', () => {
    policy.setAllowlist(['example.com']);
    blocker.setPageSite(7, '');
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  it('forgets the page site when the tab closes', () => {
    blocker.forget(7);
    expect(policy.isAllowedOn('example.com')).toBe(false);
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
  it('refuses a list that arrives short, and changes nothing', async () => {
    const blocker = blockerWithLists();
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-filters-'));
    const outcome = await blocker.fetchNewerLists(directory, async () => '[Adblock Plus 2.0]\n||one.example^');

    expect(outcome.ok).toBe(false);
    expect(existsSync(path.join(directory, 'filters', 'engine.bin'))).toBe(false);
  });

  it('refuses something that is not a filter list at all', async () => {
    const blocker = blockerWithLists();
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-filters-'));
    const outcome = await blocker.fetchNewerLists(directory, async () => 'x'.repeat(200_000));

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
