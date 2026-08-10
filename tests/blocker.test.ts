import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentBlocker } from '../electron/main/blocker';

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
