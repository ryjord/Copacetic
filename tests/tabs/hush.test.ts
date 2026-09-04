import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { sessionFrom } from '../../electron/main/tabs/tab-choices';
import path from 'node:path';

vi.mock('electron', () => ({
  session: { fromPartition: (name: string) => ({ name }) },
  shell: {},
  app: { isPackaged: true, getAppPath: () => '/app', getPath: () => '/tmp' },
}));

const { HUSH_PARTITION, WEB_PARTITION, remembersDownloads } = await import('../../electron/main/security/security');

/**
 * The promise a Hush tab makes is that nothing reaches the disk. Most of that
 * is enforced by Chromium via the partition name, and the rest by a handful of
 * `isHush` checks — so these read the source for the checks rather than
 * pretending a unit test can drive Electron's session storage.
 */
// Whitespace-collapsed, so reformatting the guard does not read as removing it.
const collapse = (path: string) => readFileSync(path, 'utf8').replace(/\s+/g, ' ');
const tabsSource = collapse('electron/main/tabs/tabs.ts');

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

// History and favicons are guards inside the tab's event handlers, so they are
// driven for real in tab-events.test.ts rather than read for here.
describe('nothing a Hush tab does is written down', () => {
  /*
   * session.json is on disk, so a Hush URL listed there would be the one place
   * the tab left a trace.
   *
   * This used to read the source of `tabs.ts` for the guard, which broke the
   * moment the rule moved into a function of its own — and would have passed
   * just as happily if the guard had been reworded rather than moved. The rule
   * is a function now, so this runs it.
   */
  it('is left out of the session snapshot', () => {
    const written = sessionFrom(
      [
        { id: 'a', url: 'https://ordinary.example/', groupId: null, isStartPage: false, isHush: false },
        { id: 'h', url: 'https://secret.example/', groupId: 'work', isStartPage: false, isHush: true },
      ],
      'a',
    );
    expect(written.tabs.map((tab) => tab.url)).toEqual(['https://ordinary.example/']);
  });

  it('cannot be brought back with reopen-closed', () => {
    expect(tabsSource).toMatch(/!tab\.isStartPage && !tab\.isHush/);
  });
});

/**
 * The claim, in the README and on the tab itself: nothing it does reaches the
 * disk, and closing it leaves nothing to delete because nothing was written. A
 * download was writing its address, its redirect chain and its time into
 * downloads.json — the file is on disk because it was asked for, but where it
 * came from is browsing, and this tab keeps none of that.
 */
describe('a Hush download is not written down', () => {
  it('does not remember what a Hush session downloaded', () => {
    expect(remembersDownloads(HUSH_PARTITION)).toBe(false);
  });

  // The counterweight: ordinary downloads are still written, and so are a
  // group's, which is browsing someone chose to keep separate rather than to
  // stop keeping.
  it("remembers every other session's downloads", () => {
    expect(remembersDownloads(WEB_PARTITION)).toBe(true);
    expect(remembersDownloads('persist:copacetic-group-abc')).toBe(true);
  });
});

/**
 * The tab that promises the most must not be the one running with the least
 * protection, and the way that went wrong was not a missing guard — it was two
 * hand-written copies of the setup and a third kind of session nobody added a
 * third copy for. Group sessions ran with permissions approved by default, no
 * tracker blocking and no download handling.
 *
 * So this counts call sites rather than looking for them. One each means every
 * session is prepared in one place and a new kind of session cannot be created
 * without being protected, because there is nowhere else to create one.
 */
describe('every session is hardened in exactly one place', () => {
  const mainSources = readdirSync('electron/main', { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(path.join('electron/main', name), 'utf8'))
    .join('\n');

  it.each(['hardenWebSession(', 'blocker.attach(', 'downloads.attach('])(
    'calls %s once across the main process',
    (installer) => {
      // Call sites, not the declaration: `export function hardenWebSession(`
      // lives in the main process too and is not a second place it is used.
      const calls = [...mainSources.matchAll(new RegExp(`(?<!function )${installer.replace('(', '\\(')}`, 'g'))];
      expect(calls).toHaveLength(1);
    },
  );

  /*
   * Counting the installers catches a second copy of the setup. It cannot catch
   * the other direction — a brand-new way of making a session that calls none
   * of them — so the sessions themselves are counted too. Every one of these is
   * a partition that has already been through prepareSession; a new call here
   * is a new session, and it has to be justified rather than appear.
   */
  it('creates a session in only the places that are accounted for', () => {
    const calls = [...mainSources.matchAll(/(?<!function )fromPartition\(/g)];
    // prepareSession itself, cookiesForSite iterating prepared partitions, and
    // getWebSession/getHushSession, which both name partitions prepared at
    // startup.
    expect(calls).toHaveLength(4);
  });

  // And that one place is reached before the tab exists, not after: a session
  // hardened once a page is already loading in it has been used unprotected.
  it('prepares the partition before the view that uses it is made', () => {
    const create = tabsSource.slice(tabsSource.indexOf('const partition = partitionFor('));
    expect(create.indexOf('this.prepareSession(partition)')).toBeLessThan(create.indexOf('new WebContentsView('));
  });
});
