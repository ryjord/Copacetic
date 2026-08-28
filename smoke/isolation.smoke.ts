import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

/**
 * Reading back what a window was actually created with is not in Electron's
 * public types, though it is there at runtime — and reading it back is the
 * whole point, since the source requesting a setting and the process running
 * with it are exactly what can disagree.
 */
interface CreatedPreferences {
  sandbox?: boolean;
  contextIsolation?: boolean;
  nodeIntegration?: boolean;
  webviewTag?: boolean;
  webSecurity?: boolean;
  allowRunningInsecureContent?: boolean;
}

type PreferenceReader = { getLastWebPreferences(): CreatedPreferences | null };

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

/**
 * The chrome is the privileged window. These are the settings that keep it from
 * being a way into the machine, asserted against the running process rather
 * than the source that requests them — the two have been known to disagree.
 */
describe('the chrome window is not a way into the machine', () => {
  it('has no Node require', async () => {
    expect(await copacetic.chrome.evaluate(() => typeof (window as { require?: unknown }).require)).toBe('undefined');
  });

  it('has no process object', async () => {
    expect(await copacetic.chrome.evaluate(() => typeof (window as { process?: unknown }).process)).toBe('undefined');
  });

  it('runs sandboxed, isolated, and without Node integration', async () => {
    const prefs = await copacetic.main(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as PreferenceReader | undefined;
      const preferences = contents?.getLastWebPreferences();
      return {
        sandbox: preferences?.sandbox,
        contextIsolation: preferences?.contextIsolation,
        nodeIntegration: preferences?.nodeIntegration,
        webviewTag: preferences?.webviewTag,
      };
    });
    expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false });
  });

  it('keeps web security on', async () => {
    const secure = await copacetic.main(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as PreferenceReader | undefined;
      const preferences = contents?.getLastWebPreferences();
      return preferences?.webSecurity !== false && preferences?.allowRunningInsecureContent !== true;
    });
    expect(secure).toBe(true);
  });
});
