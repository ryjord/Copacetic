import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let protectedUrl = '';
const ASKING_PAGE = 'https://example.com/asks';
const CREDENTIALS = `Basic ${Buffer.from('riley:open-sesame').toString('base64')}`;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.headers.authorization === CREDENTIALS) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<title>Signed in</title>');
      return;
    }
    response.writeHead(401, { 'www-authenticate': 'Basic realm="Smoke test"' });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  protectedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

/** Every view's URL, bounds and visibility, read from Electron itself. */
const layers = () =>
  copacetic.read(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((view) => ({
      url: 'webContents' in view ? (view as Electron.WebContentsView).webContents.getURL() : '',
      bounds: view.getBounds(),
      isVisible: view.getVisible?.() === true,
    })),
  );

const until = async (condition: () => Promise<boolean>, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

/**
 * A site's question was a row of the chrome, so asking pushed the page down by
 * a bar's height at a moment the site chose. It is a card over the page's
 * top-left corner now, and the page underneath stays exactly where it was.
 */
describe('a permission request', () => {
  it('is drawn over the page without moving it, and never takes the keyboard', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), ASKING_PAGE);
    await copacetic.inOpenPage(ASKING_PAGE, 'document.readyState');
    const before = (await layers()).find((layer) => layer.url === ASKING_PAGE)?.bounds;

    await copacetic.inOpenPage(
      ASKING_PAGE,
      `Notification.requestPermission().then((value) => (window.answered = value)), true`,
    );
    const isDrawn = await until(async () =>
      copacetic.leading.evaluate(() => Boolean(document.querySelector('[aria-label="Permission request"]'))),
    );
    expect(isDrawn).toBe(true);
    expect(
      await until(async () =>
        (await layers()).some((layer) => layer.url.includes('region=leading') && layer.isVisible),
      ),
    ).toBe(true);

    const now = await layers();
    expect(now.find((layer) => layer.url === ASKING_PAGE)?.bounds).toEqual(before);
    const overlay = now.find((layer) => layer.url.includes('region=leading'))?.bounds;
    expect(overlay?.x).toBe(before?.x);
    expect(overlay?.y).toBe(before?.y);
    expect(overlay?.width).toBeLessThan((before?.width ?? 0) / 2);

    // A keystroke meant for the page must not land on Allow.
    const isWithPage = await copacetic.keyboardIsWith((url) => url === ASKING_PAGE);
    // Null when the desktop never gave the app the keyboard, which leaves nothing to check.
    if (isWithPage !== null) {
      expect(isWithPage).toBe(true);
    }
  }, 90_000);

  it('answers the site when Allow is clicked in the overlay', async () => {
    await copacetic.leading.getByRole('button', { name: 'Allow' }).click();
    expect(
      await until(async () => (await copacetic.inOpenPage(ASKING_PAGE, 'window.answered ?? ""')) === 'granted'),
    ).toBe(true);
    expect(
      await until(async () =>
        (await layers()).every((layer) => !layer.url.includes('region=leading') || !layer.isVisible),
      ),
    ).toBe(true);
  }, 60_000);
});

describe('a sign-in challenge', () => {
  it('takes the keyboard, and signs in with what is typed', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), protectedUrl);
    const isDrawn = await until(async () =>
      copacetic.leading.evaluate(() => Boolean(document.querySelector('form[aria-label="Sign in"]'))),
    );
    expect(isDrawn).toBe(true);

    const holdsIt = await copacetic.keyboardIsWith((url) => url.includes('region=leading'));
    // Null when the desktop never gave the app the keyboard, which leaves nothing to check.
    if (holdsIt !== null) {
      expect(holdsIt).toBe(true);
    }
    // Typed into whatever field has focus, so the username field must be the one the card focused.
    await copacetic.leading.keyboard.type('riley');
    await copacetic.leading.keyboard.press('Tab');
    await copacetic.leading.keyboard.type('open-sesame');
    await copacetic.leading.keyboard.press('Enter');

    const isSignedIn = await until(async () =>
      copacetic.chrome.evaluate(async () =>
        (await window.copacetic.chrome.getState()).tabs.some((tab) => tab.title === 'Signed in'),
      ),
    );
    expect(isSignedIn).toBe(true);
  }, 90_000);
});
