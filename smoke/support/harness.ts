import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The environment Electron is launched with.
 *
 * `ELECTRON_RUN_AS_NODE` is set by some editors' integrated terminals, and it
 * makes the Electron binary run as a plain Node process - no window, no app,
 * and a launch failure that says only "Process failed to launch". Inheriting it
 * means these never run from inside an editor, which is exactly where someone
 * would try them first.
 */
/** Set for the checks that need the app in front - who holds the keyboard, fullscreen - so they never take the screen by default. */
export const IS_FOREGROUND_RUN = process.env.COPACETIC_SMOKE_FOREGROUND === '1';

/**
 * Whether a check that needs a tool this machine may lack is skipped or failed.
 *
 * On a laptop without openssl the check is skipped; in CI that same skip read
 * as green while proving nothing, so there it fails and says what is missing.
 */
export const skipsWhenMissing = (hasWhatItNeeds: boolean): boolean => !hasWhatItNeeds && process.env.CI !== 'true';

/** A chrome is served from the app's own origin. Tabs never are, and each window's start-page tab is a page too. */
const isChromeUrl = (url: string) => url.startsWith('copacetic-app://chrome/') && !url.includes('/overlay');

const launchEnvironment = (extra: Record<string, string> = {}): Record<string, string> => {
  const environment: Record<string, string> = { ...process.env, NODE_ENV: 'production', ...extra } as Record<
    string,
    string
  >;
  delete environment.ELECTRON_RUN_AS_NODE;
  // Launched without taking the screen, unless a run asks for the focus checks, which need the app in front.
  if (!IS_FOREGROUND_RUN) {
    environment.COPACETIC_LAUNCH_IN_BACKGROUND = '1';
  }
  return environment;
};

/**
 * Profiles created but not yet cleaned up.
 *
 * Removed on the way out however the process ends, because the ordinary
 * teardown does not run when a suite is cancelled - and an interrupted smoke
 * run is a normal thing to do while developing.
 */
const abandonedProfiles = new Set<string>();

for (const ending of ['exit', 'SIGINT', 'SIGTERM'] as const) {
  process.once(ending, () => {
    for (const profile of abandonedProfiles) {
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // A profile still held open by a process that is also going away is not
        // worth failing the run over.
      }
    }
  });
}

const READ_ATTEMPTS = 5;

/**
 * A running copy of the built app, with a profile of its own.
 *
 * Smoke specs talk to the real thing: the packaged main process, the real
 * preload, and the chrome renderer as a person's machine would load them. That
 * is the point - it is the only place the wiring between the three is exercised
 * at all, and the failures it catches (a preload that cannot be found, a window
 * that never shows) are invisible to every other kind of test here.
 */

export class SmokeApp {
  private constructor(
    private readonly app: ElectronApplication,
    readonly chrome: Page,
    readonly profile: string,
    /** The layer drawn over the page's top-right corner, where find and notices are. A view of its own, so a page of its own. */
    readonly overlay: Page,
    /** The layer drawn over the page's top-left corner, where a site's questions are. */
    readonly leading: Page,
  ) {}

  /**
   * `profile` reopens one a previous launch left with `keepProfile`, to see what
   * a restart does to it. `args` are extra Chromium switches, such as resolver
   * rules that point a public-looking name at a local server. `env` adds to
   * the app's environment, such as a home folder holding another browser.
   */
  static async launch(
    options: { profile?: string; args?: string[]; env?: Record<string, string> } = {},
  ): Promise<SmokeApp> {
    // A throwaway profile, so a smoke run never reads or writes real browsing.
    const profile = options.profile ?? realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-smoke-')));
    // Reclaimed even when the run does not finish. `close` handles the ordinary
    // path and never runs when a suite is interrupted, so a cancelled run used
    // to leave its profile behind - several thousand of them accumulated during
    // one afternoon's work, holding a quarter of a gigabyte.
    abandonedProfiles.add(profile);
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`, ...(options.args ?? [])],
      cwd: process.cwd(),
      env: launchEnvironment(options.env),
      // Playwright emulates a light colour scheme by default, which pinned the
      // chrome to light whatever Appearance said and made dark mode untestable.
      colorScheme: null,
      // Playwright adds --no-sandbox on Linux otherwise, and extension workers get their preload only when sandboxed.
      chromiumSandbox: true,
    });

    // Both the chrome and the overlay are pages, and Playwright hands back
    // whichever it saw first, so each is waited for by what its URL says.
    const windowWhere = async (matches: (url: string) => boolean, what: string): Promise<Page> => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const found = app.windows().find((candidate) => matches(candidate.url()));
        if (found) {
          return found;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`the app never opened its ${what}`);
    };

    const chrome = await windowWhere(isChromeUrl, 'chrome window');
    await chrome.waitForLoadState('domcontentloaded');

    // Previously `overlay ?? chrome`, which made an overlay that had not been
    // created yet indistinguishable from a working one: keystrokes meant for it
    // went to the chrome, found a button that happened to match, and the spec
    // failed somewhere else entirely. A missing overlay is a failure with a
    // name now, not a silent substitution.
    const overlay = await windowWhere((url) => url.includes('region=trailing'), 'trailing overlay');
    await overlay.waitForLoadState('domcontentloaded');
    const leading = await windowWhere((url) => url.includes('region=leading'), 'leading overlay');
    await leading.waitForLoadState('domcontentloaded');

    return new SmokeApp(app, chrome, profile, overlay, leading);
  }

  /**
   * Open a page in a real tab and read something out of it.
   *
   * The tab is created through the same call the interface makes, so it is a
   * genuine tab with every guard the app installs on one. Building a view
   * directly here would skip all of that and quietly test nothing.
   */
  async inPage<T>(url: string, expression: string): Promise<T> {
    await this.chrome.evaluate((target) => window.copacetic.tabs.create(target), url);

    const ready = await this.until(async () => (await this.pageCount(url)) > 0, 20_000);
    if (!ready) {
      throw new Error(`no tab ever reached ${url}`);
    }

    return this.app.evaluate(
      async ({ webContents }, options) => {
        const page = webContents
          .getAllWebContents()
          .filter((contents) => contents.getURL().startsWith(options.url))
          .at(-1);
        if (!page) {
          throw new Error(`no web contents at ${options.url}`);
        }
        return (await page.executeJavaScript(options.expression)) as T;
      },
      { url, expression },
    );
  }

  /** Runs something in a page that is already open, newest first, without opening another tab for it. */
  async inOpenPage<T>(url: string, expression: string, options: { userGesture?: boolean } = {}): Promise<T> {
    const timeoutMs = 20_000;
    const ready = await this.until(async () => (await this.pageCount(url)) > 0, timeoutMs);
    if (!ready) {
      throw new Error(`no open tab ever reached ${url}`);
    }
    return this.app.evaluate(
      async ({ webContents }, options) => {
        const page = webContents
          .getAllWebContents()
          .filter((contents) => contents.getURL().startsWith(options.url))
          .at(-1);
        if (!page) {
          throw new Error(`no web contents at ${options.url}`);
        }
        return (await page.executeJavaScript(options.expression, options.userGesture)) as T;
      },
      { url, expression, userGesture: options.userGesture === true },
    );
  }

  private pageCount(url: string): Promise<number> {
    return this.read(
      ({ webContents }, target) =>
        webContents.getAllWebContents().filter((contents) => contents.getURL().startsWith(target)).length,
      url,
    );
  }

  /**
   * Runs something in the main process, where Electron's own objects live.
   *
   * The function is serialised and evaluated over there, so it closes over
   * nothing here - anything it needs from the spec has to be passed as `arg`.
   */
  main<T, A = undefined>(
    fn: (electronModule: typeof import('electron'), arg: A) => T | Promise<T>,
    arg?: A,
  ): Promise<T> {
    // Playwright maps the argument through its own `Unboxed`, which unwraps
    // handles and which the compiler cannot reduce for a type variable. For
    // everything a spec sends across a process boundary the two are the same
    // type, so this narrows to what is actually passed rather than papering
    // over a mismatch.
    const run = fn as (electronModule: typeof import('electron'), arg: unknown) => T | Promise<T>;
    return this.app.evaluate(run, arg);
  }

  /**
   * `main` for a function that only looks, and so can be asked again.
   *
   * Playwright now and then loses the promise of a main-process evaluate and
   * reports it garbage collected, more often on a loaded CI runner. Only a
   * read is retried: something that changes state might already have changed it.
   */
  async read<T, A = undefined>(
    fn: (electronModule: typeof import('electron'), arg: A) => T | Promise<T>,
    arg?: A,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.main(fn, arg);
      } catch (error) {
        const isLost = error instanceof Error && error.message.includes('Resulting promise was garbage collected');
        if (!isLost || attempt === READ_ATTEMPTS) {
          throw error;
        }
        // Spaced out, since it comes in spells: three asked back to back were lost together.
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }

  /** Chooses an application menu item by label, the same as a click on it in the menu bar. */
  async chooseMenuItem(label: string): Promise<void> {
    const isChosen = await this.main(({ Menu, BrowserWindow }, target) => {
      const flatten = (items: Electron.MenuItem[]): Electron.MenuItem[] =>
        items.flatMap((item) => [item, ...flatten(item.submenu?.items ?? [])]);
      const found = flatten(Menu.getApplicationMenu()?.items ?? []).find((item) => item.label === target);
      found?.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
      return found !== undefined;
    }, label);
    if (!isChosen) {
      throw new Error(`no menu item labelled ${label}`);
    }
  }

  /**
   * Whether the part of the window holding the keyboard is the one `holds` picks, by address.
   *
   * Keystrokes sent from here reach a page whether or not it is focused, so
   * typing proves nothing about focus. This asks Electron instead, and only
   * counts a moment when the window itself holds the keyboard: the desktop
   * hands focus around, and on a build machine may never hand it to the app at
   * all. Null when the window never had it, because then nothing can be said,
   * and at once in a background run, where the app is never in front.
   */
  async keyboardIsWith(holds: (url: string) => boolean): Promise<boolean | null> {
    if (!IS_FOREGROUND_RUN) {
      return null;
    }
    let didWindowHaveIt = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const now = await this.main(({ BrowserWindow, webContents }) => {
        return {
          isWindowFocused: BrowserWindow.getAllWindows()[0]?.isFocused() === true,
          focusedUrl:
            webContents
              .getAllWebContents()
              .find((contents) => contents.isFocused())
              ?.getURL() ?? '',
        };
      });
      didWindowHaveIt = didWindowHaveIt || now.isWindowFocused;
      if (now.isWindowFocused && holds(now.focusedUrl)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return didWindowHaveIt ? false : null;
  }

  /** Every window's chrome, in the order Playwright met them; the overlays are pages too and are left out. */
  chromePages(): Page[] {
    return this.app.windows().filter((page) => isChromeUrl(page.url()));
  }

  /** Polls until `condition` holds, for the things the app does on its own schedule. */
  async until(condition: () => Promise<boolean> | boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await condition()) {
          return true;
        }
      } catch {
        // A poll that lands mid-navigation throws "Execution context was
        // destroyed", which means the page is not ready rather than that the
        // wait has failed. Swallowing it here costs nothing: a condition that
        // never holds still runs out the clock and returns false, and the
        // caller's assertion says so.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  /**
   * The window is created hidden and shown once it can paint, so becoming
   * visible is something to wait for rather than sample.
   */
  waitForVisible(timeoutMs = 30_000): Promise<boolean> {
    return this.until(
      async () => (await this.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())) === true,
      timeoutMs,
    );
  }

  /**
   * Waits until the chrome is listening, not merely painted.
   *
   * `waitForVisible` answers a different question. The window is shown as soon
   * as it can paint; the renderer keeps hydrating for a while after that before
   * it subscribes to anything the main process pushes - about 190ms on the
   * machine in the README, and later still on a cold start, which is slower
   * throughout. A test that acts in that gap sends a push to nobody and then
   * reports the feature broken -
   * which is exactly what happened to a menu item that turned out to be fine.
   */
  async waitForReady(timeoutMs = 20_000): Promise<boolean> {
    return this.until(
      async () => (await this.chrome.evaluate(() => Boolean(document.querySelector('[role="tablist"]')))) === true,
      timeoutMs,
    );
  }

  /**
   * Waits until the interface says what the test is waiting for.
   *
   * The suite is full of `setTimeout(resolve, 1500)` followed by an assertion,
   * which is a wait made of hope: it passes on the machine it was written on and
   * fails on a slower one, reporting the feature as broken when it means it has
   * not happened yet. Three separate CI failures during one afternoon were this
   * and nothing else.
   *
   * A condition that never becomes true still fails, which is the part worth
   * keeping - it just takes the deadline to say so instead of guessing early.
   */
  waitForChrome(says: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<boolean> {
    return this.until(() => this.chrome.evaluate(says), timeoutMs);
  }

  /** Whether the app has written a given file into its profile yet. */
  hasProfileFile(name: string): boolean {
    return existsSync(path.join(this.profile, name));
  }

  /** History as it is in the database file, read from outside the app rather than asked of it. */
  historyOnDisk(): { url: string; blockedCount: number }[] {
    const file = path.join(this.profile, 'copacetic.db');
    if (!existsSync(file)) {
      return [];
    }
    const database = new DatabaseSync(file, { readOnly: true });
    try {
      return database
        .prepare('SELECT url, blocked_count FROM history')
        .all()
        .map((row) => ({ url: String(row.url), blockedCount: Number(row.blocked_count) }));
    } finally {
      database.close();
    }
  }

  /** Downloads as they are in the database file, read from outside the app. */
  downloadsOnDisk(): { url: string }[] {
    const file = path.join(this.profile, 'copacetic.db');
    if (!existsSync(file)) {
      return [];
    }
    const database = new DatabaseSync(file, { readOnly: true });
    try {
      return database
        .prepare('SELECT url FROM downloads')
        .all()
        .map((row) => ({ url: String(row.url) }));
    } finally {
      database.close();
    }
  }

  /** Any table in the database file, read from outside the app, for what a test needs to see was written down. */
  tableOnDisk(
    table: 'bookmarks' | 'bookmark_folders' | 'site_permissions' | 'site_zoom' | 'tracker_exceptions',
  ): Record<string, unknown>[] {
    const file = path.join(this.profile, 'copacetic.db');
    if (!existsSync(file)) {
      return [];
    }
    const database = new DatabaseSync(file, { readOnly: true });
    try {
      // In the order the app shows them, where the table keeps one.
      const rows = database.prepare(`SELECT * FROM ${table}`).all();
      return rows.sort((aRow, bRow) => Number(aRow.position ?? 0) - Number(bRow.position ?? 0));
    } finally {
      database.close();
    }
  }

  /** The database and its write-ahead log as raw bytes, which is where a deleted address would linger. */
  databaseBytes(): string {
    return ['copacetic.db', 'copacetic.db-wal']
      .map((name) => path.join(this.profile, name))
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file).toString('latin1'))
      .join('');
  }

  readProfileFile(name: string): string {
    return readFileSync(path.join(this.profile, name), 'utf8');
  }

  /** Files are written on a debounce, so waiting for one is normal rather than a smell. */
  waitForProfileFile(name: string, timeoutMs = 10_000): Promise<boolean> {
    return this.until(() => this.hasProfileFile(name), timeoutMs);
  }

  /**
   * Waits until a stored file says what the test is waiting for.
   *
   * Sleeping for a fixed moment and then reading is the same wait written
   * badly: it fails on a machine slower than the one it was written on, and it
   * says "the feature is broken" when it means "not yet". A file that never
   * arrives at the expected shape still fails, which is the part worth keeping.
   */
  async waitForProfileJson<T>(
    name: string,
    matches: (contents: T) => boolean,
    timeoutMs = 15_000,
  ): Promise<T | null> {
    let last: T | null = null;
    const arrived = await this.until(() => {
      if (!this.hasProfileFile(name)) {
        return false;
      }
      try {
        last = JSON.parse(this.readProfileFile(name)) as T;
      } catch {
        // Mid-write, which is a moment rather than a failure.
        return false;
      }
      return matches(last);
    }, timeoutMs);
    return arrived ? last : last;
  }

  /**
   * Shuts the app down, and gives up rather than hanging.
   *
   * `close` waits for the application to end, and an application can decline to
   * - a window created after Playwright attached is one it is not watching for.
   * On a build machine that turned a working spec into a suite that failed in
   * its teardown with every test passed, which says nothing about the product
   * and takes an hour to read.
   *
   * So it asks, waits a while, and then stops asking. The process goes either
   * way; only the politeness is optional.
   */
  /** Ends the app with no warning at all, as a crash would, and leaves the profile for the next launch. */
  async crash(): Promise<void> {
    const main = this.app.process();
    const ended = new Promise<void>((resolve) => main.once('exit', () => resolve()));
    // Windows leaves the GPU and renderer processes holding the single-instance lock, so the whole tree goes.
    if (process.platform === 'win32' && main.pid !== undefined) {
      execFileSync('taskkill', ['/PID', String(main.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      main.kill('SIGKILL');
    }
    await ended;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async close(options: { keepProfile?: boolean } = {}): Promise<void> {
    const politely = this.app.close().then(
      () => true,
      () => false,
    );
    const gaveUp = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 15_000);
      timer.unref?.();
    });

    if (!(await Promise.race([politely, gaveUp]))) {
      this.app.process().kill('SIGKILL');
    }

    if (options.keepProfile) {
      return;
    }
    // Retried: Chromium can still be writing into the profile for a moment after the app has quit.
    rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    abandonedProfiles.delete(this.profile);
  }
}
