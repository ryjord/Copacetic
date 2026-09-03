import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com'));
  await new Promise((resolve) => setTimeout(resolve, 4500));
});
afterAll(async () => copacetic?.close());

const onDisk = <T>(file: string): T | null => {
  const full = path.join(copacetic.profile, file);
  return existsSync(full) ? (JSON.parse(readFileSync(full, 'utf8')) as T) : null;
};

/**
 * Counted as it happens, not when the visit is recorded.
 *
 * A visit is recorded when the title arrives, which is early — most trackers
 * have not been refused yet. Sampling then reports almost nothing on every page
 * in the browser, and the number looks plausible enough that nobody checks it.
 */
describe('what a page refused', () => {
  it('is counted against the page in history', async () => {
    await copacetic.inPage(
      'https://example.com',
      `
      (async () => {
        const urls = [
          'https://www.google-analytics.com/analytics.js',
          'https://bat.bing.com/bat.js',
          'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
        ];
        for (const url of urls) { try { await fetch(url, { mode: 'no-cors' }); } catch {} }
        return true;
      })()
    `,
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const entries = onDisk<{ url: string; blockedCount?: number }[]>('history.json') ?? [];
    const page = entries.find((entry) => entry.url.includes('example.com'));
    expect(page?.blockedCount).toBeGreaterThanOrEqual(3);

    const total = await copacetic.chrome.evaluate(() => window.copacetic.history.totalBlocked());
    expect(total).toBeGreaterThanOrEqual(3);
  }, 180_000);

  /*
   * Counted once, and checked against the blocker's own number rather than a
   * bound. The blocker reports a running total per tab, so adding it whole on
   * every refusal sums 1+2+3 instead of 3 — quadratic, and still small enough
   * to look plausible. An earlier version of this asserted "fewer than ten" and
   * passed with exactly that bug in place.
   */
  it('matches what the blocker actually refused', async () => {
    const refusedByBlocker = await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      let total = 0;
      for (const tab of state.tabs) {
        for (const entry of await window.copacetic.connections.list(tab.id)) {
          total += entry.blocked;
        }
      }
      return total;
    });

    const entries = onDisk<{ url: string; blockedCount?: number }[]>('history.json') ?? [];
    const counted = entries.reduce((total, entry) => total + (entry.blockedCount ?? 0), 0);

    expect(refusedByBlocker).toBeGreaterThan(0);
    expect(counted).toBe(refusedByBlocker);
  }, 90_000);
});

/**
 * Clearing history used to clear history and leave the evidence. Measured
 * before this existed: afterwards, settings.json still named every site with a
 * zoom, a permission or a blocking exception, and the icon cache still held an
 * entry per origin visited.
 */
describe('forgetting one site', () => {
  it('says what it will remove before it does', async () => {
    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      const tab = state.tabs.find((entry) => entry.url.includes('example.com'));
      if (tab) {
        await window.copacetic.tabs.setZoom(tab.id, 1.5);
      }
      await window.copacetic.settings.update({ blockerAllowlist: ['example.com'] });
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const traces = await copacetic.chrome.evaluate(() =>
      window.copacetic.history.traces('https://www.example.com/anything'),
    );
    // Asked with a subdomain and a path: a person forgetting example.com means
    // the whole of it, not the one address they happen to be looking at.
    expect(traces.visits).toBeGreaterThan(0);
    expect(traces.zoom).toBe(1);
    expect(traces.blockingOff).toBe(1);
  }, 90_000);

  it('removes every trace of it, and leaves other sites alone', async () => {
    await copacetic.chrome.evaluate(async () => {
      await window.copacetic.settings.update({ blockerAllowlist: ['example.com', 'keep-me.example'] });
      await window.copacetic.history.forgetSite('https://example.com');
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const history = onDisk<{ url: string }[]>('history.json') ?? [];
    expect(history.some((entry) => entry.url.includes('example.com'))).toBe(false);

    const settings = onDisk<{ zoomLevels: Record<string, number>; blockerAllowlist: string[] }>('settings.json');
    expect(Object.keys(settings?.zoomLevels ?? {})).toEqual([]);
    // The counterweight: forgetting one site must not forget the others.
    expect(settings?.blockerAllowlist).toEqual(['keep-me.example']);
  }, 90_000);
});

/**
 * What survives a clear, listed rather than left to be found.
 *
 * These are kept on purpose — someone set them — but they name the sites, and
 * a list nobody is shown is a list nobody can act on.
 */
describe('what clearing does not touch', () => {
  it('names each kind with its count, and only the kinds that exist', async () => {
    await copacetic.chrome.evaluate(async () => {
      await window.copacetic.settings.update({
        blockerAllowlist: ['one.example', 'two.example'],
        permissionDecisions: {},
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 900));

    const kept = await copacetic.chrome.evaluate(() => window.copacetic.data.kept());
    expect(kept.blockingOff).toBe(2);
    // Nothing granted a permission, so nothing should claim otherwise.
    expect(kept.permissions).toBe(0);
  }, 90_000);

  it('clears one kind without touching the others', async () => {
    await copacetic.chrome.evaluate(async () => {
      await window.copacetic.settings.update({ blockerAllowlist: ['one.example'] });
      const state = await window.copacetic.chrome.getState();
      const tab = state.tabs.find((entry) => entry.url.includes('example.com'));
      if (tab) {
        await window.copacetic.tabs.setZoom(tab.id, 1.25);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 900));

    await copacetic.chrome.evaluate(() => window.copacetic.data.clearKept('blockingOff'));
    await new Promise((resolve) => setTimeout(resolve, 900));

    const kept = await copacetic.chrome.evaluate(() => window.copacetic.data.kept());
    expect(kept.blockingOff).toBe(0);
    // The counterweight: clearing one kind is not clearing everything.
    expect(kept.zoom).toBeGreaterThan(0);
  }, 90_000);
});
