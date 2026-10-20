import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let origin = '';

// A sign-in button as Google's and Apple's work: a pop-up that answers the page that opened it.
const PAGES: Record<string, string> = {
  '/site': `<title>Site</title><script>
    window.addEventListener('message', (event) => { document.title = 'Signed in: ' + event.data; });
    document.addEventListener('mousedown', () => window.open('/provider', 'signin', 'width=480,height=640'));
  </script>`,
  '/provider': `<title>Provider</title><script>
    window.opener ? window.opener.postMessage('token-123', '*') : (document.title = 'No opener');
  </script>`,
};

beforeAll(async () => {
  server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGES[request.url ?? ''] ?? '<title>Nothing</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

describe('a sign-in pop-up', () => {
  it('opens as a tab that can still answer the page that opened it', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `${origin}/site`);
    await copacetic.inOpenPage(`${origin}/site`, 'document.readyState');
    const windowsBefore = await copacetic.read(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    // A real press, as a sign-in button needs; window.open from script alone is a pop-up Chromium blocks.
    await copacetic.main(({ webContents }, url) => {
      const page = webContents.getAllWebContents().find((contents) => contents.getURL() === url);
      page?.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
      page?.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
    }, `${origin}/site`);

    const siteTitle = () =>
      copacetic.read(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === url)
            ?.getTitle(),
        `${origin}/site`,
      );
    expect(await copacetic.until(async () => (await siteTitle()) === 'Signed in: token-123', 15_000)).toBe(true);

    // A tab, never a window: the strip has it, and no window was added.
    const tabs = await copacetic.chrome.evaluate(async () =>
      (await window.copacetic.chrome.getState()).tabs.map((tab) => tab.url),
    );
    expect(tabs).toContain(`${origin}/provider`);
    expect(await copacetic.read(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(windowsBefore);
  }, 90_000);
});
