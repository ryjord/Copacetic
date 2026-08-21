import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('electron', () => ({
  session: { fromPartition: (name: string) => ({ name }) },
  shell: {},
  app: { isPackaged: true, getAppPath: () => '/app', getPath: () => '/tmp' },
}));

const { HUSH_PARTITION, WEB_PARTITION } = await import('../../electron/main/security/security');

/**
 * The promise a Hush tab makes is that nothing reaches the disk. Most of that
 * is enforced by Chromium via the partition name, and the rest by a handful of
 * `isHush` checks — so these read the source for the checks rather than
 * pretending a unit test can drive Electron's session storage.
 */
// Whitespace-collapsed, so reformatting the guard does not read as removing it.
const collapse = (path: string) => readFileSync(path, 'utf8').replace(/\s+/g, ' ');
const tabsSource = collapse('electron/main/tabs/tabs.ts');
const browserSource = collapse('electron/main/app/browser.ts');

describe('the partition is what makes the promise true', () => {
  // Without `persist:` Chromium keeps the entire session in memory and drops
  // it when the last reference goes. A "private" mode that writes and then
  // deletes is one crash away from not having deleted.
  it('is in-memory, not a persisted partition it has to clean up afterwards', () => {
    expect(HUSH_PARTITION.startsWith('persist:')).toBe(false);
    expect(WEB_PARTITION.startsWith('persist:')).toBe(true);
  });

  it('is a different partition from ordinary browsing', () => {
    expect(HUSH_PARTITION).not.toBe(WEB_PARTITION);
  });
});

describe('nothing a Hush tab does is written down', () => {
  it('does not record a visit in history', () => {
    expect(tabsSource).toMatch(/if \(!tab\.isHush\) \{ this\.store\.recordVisit/);
  });

  // A favicon cache is a list of sites visited, stored under another name.
  it('does not cache favicons', () => {
    expect(tabsSource).toMatch(/faviconUrl && !tab\.isHush/);
  });

  // session.json is on disk, so a Hush URL listed there would be the one place
  // the tab left a trace.
  it('is left out of the session snapshot', () => {
    expect(tabsSource).toMatch(/tab\.isStartPage \|\| tab\.isHush\) \{ continue/);
  });

  it('cannot be brought back with reopen-closed', () => {
    expect(tabsSource).toMatch(/!tab\.isStartPage && !tab\.isHush/);
  });
});

describe('a Hush tab is not a less protected tab', () => {
  // The tab that promises the most must not be the one running with the least
  // protection: a separate session means every guard has to be installed twice.
  it.each(['hardenWebSession(hushSession', 'blocker.attach(hushSession)', 'downloads.attach(hushSession)'])(
    'installs %s on the hush session too',
    (fragment) => {
      expect(browserSource).toContain(fragment);
    },
  );
});
