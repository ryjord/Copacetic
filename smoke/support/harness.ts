import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
      env: { ...process.env, NODE_ENV: 'production' },
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

  /** Run something in the main process, where Electron's own objects live. */
  main<T>(fn: (electronModule: typeof import('electron')) => T | Promise<T>): Promise<T> {
    return this.app.evaluate(fn);
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
