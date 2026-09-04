import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The environment Electron is launched with.
 *
 * `ELECTRON_RUN_AS_NODE` is set by some editors' integrated terminals, and it
 * makes the Electron binary run as a plain Node process — no window, no app,
 * and a launch failure that says only "Process failed to launch". Inheriting it
 * means these never run from inside an editor, which is exactly where someone
 * would try them first.
 */
const launchEnvironment = (): Record<string, string> => {
  const environment: Record<string, string> = { ...process.env, NODE_ENV: 'production' } as Record<string, string>;
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
};

/**
 * Profiles created but not yet cleaned up.
 *
 * Removed on the way out however the process ends, because the ordinary
 * teardown does not run when a suite is cancelled — and an interrupted smoke
 * run is a normal thing to do while developing.
 */
const abandonedProfiles = new Set<string>();

for (const ending of ['exit', 'SIGINT', 'SIGTERM'] as const) {
  process.once(ending, () => {
    for (const profile of abandonedProfiles) {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // A profile still held open by a process that is also going away is not
        // worth failing the run over.
      }
    }
  });
}

/**
 * A running copy of the built app, with a profile of its own.
 *
 * Smoke specs talk to the real thing: the packaged main process, the real
 * preload, and the chrome renderer as a person's machine would load them. That
 * is the point — it is the only place the wiring between the three is exercised
 * at all, and the failures it catches (a preload that cannot be found, a window
 * that never shows) are invisible to every other kind of test here.
 */
export class SmokeApp {
  private constructor(
    private readonly app: ElectronApplication,
    readonly chrome: Page,
    readonly profile: string,
    /** The layer drawn above the page. A view of its own, so a page of its own. */
    readonly overlay: Page,
  ) {}

  static async launch(): Promise<SmokeApp> {
    // A throwaway profile, so a smoke run never reads or writes real browsing.
    const profile = realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-smoke-')));
    // Reclaimed even when the run does not finish. `close` handles the ordinary
    // path and never runs when a suite is interrupted, so a cancelled run used
    // to leave its profile behind — several thousand of them accumulated during
    // one afternoon's work, holding a quarter of a gigabyte.
    abandonedProfiles.add(profile);
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
      cwd: process.cwd(),
      env: launchEnvironment(),
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

    const chrome = await windowWhere((url) => !url.includes('/overlay'), 'chrome window');
    await chrome.waitForLoadState('domcontentloaded');

    // Previously `overlay ?? chrome`, which made an overlay that had not been
    // created yet indistinguishable from a working one: keystrokes meant for it
    // went to the chrome, found a button that happened to match, and the spec
    // failed somewhere else entirely. A missing overlay is a failure with a
    // name now, not a silent substitution.
    const overlay = await windowWhere((url) => url.includes('/overlay'), 'overlay layer');
    await overlay.waitForLoadState('domcontentloaded');

    return new SmokeApp(app, chrome, profile, overlay);
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

  private pageCount(url: string): Promise<number> {
    return this.app.evaluate(
      ({ webContents }, target) =>
        webContents.getAllWebContents().filter((contents) => contents.getURL().startsWith(target)).length,
      url,
    );
  }

  /**
   * Runs something in the main process, where Electron's own objects live.
   *
   * The function is serialised and evaluated over there, so it closes over
   * nothing here — anything it needs from the spec has to be passed as `arg`.
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

  /** Polls until `condition` holds, for the things the app does on its own schedule. */
  private async until(condition: () => Promise<boolean> | boolean, timeoutMs: number): Promise<boolean> {
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
   * it subscribes to anything the main process pushes — about 190ms on the
   * machine in the README, and later still on a cold start, which is slower
   * throughout. A test that acts in that gap sends a push to nobody and then
   * reports the feature broken —
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
   * keeping — it just takes the deadline to say so instead of guessing early.
   */
  waitForChrome(says: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<boolean> {
    return this.until(() => this.chrome.evaluate(says), timeoutMs);
  }

  /** Whether the app has written a given file into its profile yet. */
  hasProfileFile(name: string): boolean {
    return existsSync(path.join(this.profile, name));
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
   * — a window created after Playwright attached is one it is not watching for.
   * On a build machine that turned a working spec into a suite that failed in
   * its teardown with every test passed, which says nothing about the product
   * and takes an hour to read.
   *
   * So it asks, waits a while, and then stops asking. The process goes either
   * way; only the politeness is optional.
   */
  async close(): Promise<void> {
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

    rmSync(this.profile, { recursive: true, force: true });
    abandonedProfiles.delete(this.profile);
  }
}
