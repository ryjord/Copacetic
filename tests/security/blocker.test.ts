import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentBlocker } from '../../electron/main/security/blocker';

interface CapturedRequest {
  url: string;
  resourceType: string;
  webContentsId?: number;
}

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
    blocker = new ContentBlocker(true);
    fake = fakeSession();
    blocker.attach(fake.session as never);
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
    blocker.setEnabled(false);
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

    it('forgets a tab entirely when it closes', () => {
      ask('https://www.google-analytics.com/collect', 'script', 7);
      blocker.forget(7);
      expect(blocker.countFor(7)).toBe(0);
    });
  });
});

describe('ContentBlocker, fully-qualified hostnames', () => {
  let fake: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    const blocker = new ContentBlocker(true);
    fake = fakeSession();
    blocker.attach(fake.session as never);
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
    blocker = new ContentBlocker(true);
    fake = fakeSession();
    blocker.attach(fake.session as never);
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
    blocker.setEnabled(false);
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
    blocker = new ContentBlocker(true);
    fake = fakeSession();
    blocker.attach(fake.session as never);
    blocker.setPageSite(7, 'example.com');
  });

  const ask = (url: string, webContentsId = 7) => fake.request({ url, resourceType: 'script', webContentsId });

  it('blocks a tracker on a site with no exception', () => {
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  it('stops blocking on a site the user allowed', () => {
    blocker.setAllowlist(['example.com']);
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(false);
  });

  // The exception is about the page you are on, not the tracker itself.
  it('does not carry the exception to another site', () => {
    blocker.setAllowlist(['example.com']);
    blocker.setPageSite(9, 'other.com');
    expect(ask('https://doubleclick.net/pixel.gif', 9)).toBe(true);
  });

  it('still records what was allowed through, so the log stays honest', () => {
    blocker.setAllowlist(['example.com']);
    ask('https://doubleclick.net/pixel.gif');

    expect(blocker.connectionsFor(7)).toContainEqual(
      expect.objectContaining({ host: 'doubleclick.net', isTracker: true, blocked: 0 }),
    );
  });

  it('can be taken back', () => {
    blocker.setAllowlist(['example.com']);
    blocker.setAllowlist([]);
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  it('blocks normally when the page site is unknown', () => {
    blocker.setAllowlist(['example.com']);
    blocker.setPageSite(7, '');
    expect(ask('https://doubleclick.net/pixel.gif')).toBe(true);
  });

  it('forgets the page site when the tab closes', () => {
    blocker.forget(7);
    expect(blocker.isAllowedOn('example.com')).toBe(false);
  });
});
