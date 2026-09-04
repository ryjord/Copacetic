import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

/**
 * A file of its own, deliberately.
 *
 * This closes every window and asks for another, which is app-wide state no
 * other spec can be handed back in. Tried inside the startup spec first, both
 * sharing its app — where the suite's teardown hung waiting for an app it could
 * no longer close — and then launching a second app beside it, where the second
 * launch never returned. Its own file costs one more app start and removes both.
 */
beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * macOS keeps an application running after its last window closes, and clicking
 * the dock icon is how a person asks for it back.
 *
 * The handler for that returned early when the window was gone, so the app sat
 * in the dock, alive, with no window and no way to open one — usable only by
 * force-quitting it. Everywhere else the last window closing quits, so this is
 * the one platform where it matters and the one platform it was broken on.
 */
describe('closing the last window on macOS', () => {
  it.skipIf(process.platform !== 'darwin')(
    'leaves an app that can open another',
    async () => {
      await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Gone, and the app still running — the macOS convention, and the state the
      // bug left someone stuck in.
      expect(await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);

      // What clicking the dock icon does.
      await copacetic.main(({ app }) => app.emit('activate'));
      const reopened = await copacetic.main(async ({ BrowserWindow }) => {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          if (BrowserWindow.getAllWindows().length > 0) {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return false;
      });
      expect(reopened).toBe(true);
    },
    120_000,
  );
});
