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
  ) {}

  static async launch(): Promise<SmokeApp> {
    // A throwaway profile, so a smoke run never reads or writes real browsing.
    const profile = realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-smoke-')));
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
    });

    const chrome = await app.firstWindow();
    await chrome.waitForLoadState('domcontentloaded');
    return new SmokeApp(app, chrome, profile);
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
