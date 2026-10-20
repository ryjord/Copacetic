import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let origin = '';

const PAGES: Record<string, string> = {
  // Hands a link to the mail app the moment it loads, with nobody having touched it.
  '/on-load': `<title>On load</title><script>location.href = 'mailto:unasked@example.com'</script>`,
  '/on-click': `<title>On click</title><script>document.addEventListener('mousedown', () => { location.href = 'mailto:clicked@example.com' })</script>`,
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
  // Every question recorded and answered no, so nothing is ever handed to a real app.
  await copacetic.main(({ dialog }) => {
    const asked: string[] = [];
    Reflect.set(globalThis, 'appLinkQuestions', asked);
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args.at(-1) as { detail?: string };
      asked.push(options.detail ?? '');
      return { response: 1, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

const questions = () => copacetic.read(() => (Reflect.get(globalThis, 'appLinkQuestions') as string[]).slice());

describe('a link to another app', () => {
  it('is refused without a question when the page opens it on its own', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `${origin}/on-load`);
    await copacetic.inOpenPage(`${origin}/on-load`, 'document.readyState');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await questions()).toEqual([]);
  }, 60_000);

  it('is asked about when someone has just clicked', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `${origin}/on-click`);
    await copacetic.inOpenPage(`${origin}/on-click`, 'document.readyState');
    await copacetic.main(({ webContents }, url) => {
      const page = webContents
        .getAllWebContents()
        .filter((contents) => contents.getURL().startsWith(url))
        .at(-1);
      page?.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
      page?.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
    }, `${origin}/on-click`);
    const deadline = Date.now() + 10_000;
    while ((await questions()).length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect((await questions()).some((detail) => detail.includes('clicked@example.com'))).toBe(true);
  }, 60_000);
});
