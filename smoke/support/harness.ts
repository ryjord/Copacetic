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
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
      cwd: process.cwd(),
      env: launchEnvironment(),
    });

    // The overlay is a page too, and Playwright hands back whichever it saw
    // first. The chrome is the one that is not the overlay.
    const chrome = await (async () => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        for (const candidate of app.windows()) {
          if (!candidate.url().includes('/overlay')) {
            return candidate;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return app.firstWindow();
    })();
    await chrome.waitForLoadState('domcontentloaded');
    const overlay = app.windows().find((candidate) => candidate.url().includes('/overlay'));
    return new SmokeApp(app, chrome, profile, overlay ?? chrome);
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
      if (await condition()) {
        return true;
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
   * machine in the README, and longer on a cold start. A test that acts
   * in that gap sends a push to nobody and then reports the feature broken —
   * which is exactly what happened to a menu item that turned out to be fine.
   */
  async waitForReady(timeoutMs = 20_000): Promise<boolean> {
    return this.until(
      async () => (await this.chrome.evaluate(() => Boolean(document.querySelector('[role="tablist"]')))) === true,
      timeoutMs,
    );
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

  async close(): Promise<void> {
    await this.app.close();
    rmSync(this.profile, { recursive: true, force: true });
  }
}
