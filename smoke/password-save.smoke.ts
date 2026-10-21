import { type Server, createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let origin = '';

const PAGES: Record<string, string> = {
  '/signin':
    '<title>sign in</title><form action="/welcome" method="post"><input type="email" name="email"><input type="password" name="password"><button>Sign in</button></form>',
  // A sign-in that failed leaves the page where it was.
  '/wrong':
    '<title>wrong</title><form onsubmit="event.preventDefault()"><input type="email" name="email"><input type="password" name="password"><button>Sign in</button></form>',
  '/step-one':
    '<title>step one</title><form action="/step-two"><input type="email" name="identifier"><button>Next</button></form>',
  '/step-two':
    '<title>step two</title><form action="/welcome" method="post"><input type="password" name="password"><button>Sign in</button></form>',
  '/welcome': '<title>welcome</title>',
};

beforeAll(async () => {
  server = createServer((request, response) => {
    const page = PAGES[(request.url ?? '').split('?')[0] ?? ''];
    response.setHeader('Content-Type', 'text/html');
    response.end(page ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
}, 60_000);

afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

const isShowing = (url: string) =>
  copacetic.read(
    ({ webContents }, target) => webContents.getAllWebContents().some((contents) => contents.getURL() === target),
    url,
  );

const offer = () => copacetic.chrome.evaluate(async () => (await window.copacetic.chrome.getState()).passwordOffer);

/** Opens a page, waits for it to settle, then fills its fields and presses its button as a person would. */
async function send(path: string, fields: Record<string, string>): Promise<void> {
  const url = `${origin}${path}`;
  await copacetic.chrome.evaluate((target) => window.copacetic.tabs.create(target), url);
  await copacetic.until(() => isShowing(url), 10_000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await copacetic.inOpenPage(
    url,
    `(() => { const fields = ${JSON.stringify(fields)}; Object.entries(fields).forEach(([name, value]) => { document.querySelector('[name="' + name + '"]').value = value; }); document.querySelector('button').click(); return 'sent'; })()`,
  );
}

describe('offering to save a password', () => {
  it('offers to save one after a sign-in that moves on, telling the window only the site and username', async () => {
    await send('/signin', { email: 'riley@example.com', password: 'correct horse battery staple' });
    expect(await copacetic.until(async () => (await offer()) !== null, 10_000)).toBe(true);
    const offered = await offer();
    expect(offered).toMatchObject({ site: '127.0.0.1', username: 'riley@example.com', kind: 'save' });
    expect(JSON.stringify(offered)).not.toContain('correct horse');
    await copacetic.chrome.evaluate((id) => window.copacetic.vault.answerSaveOffer(id, 'dismiss'), offered?.id ?? '');
    expect(await copacetic.until(async () => (await offer()) === null, 5_000)).toBe(true);
  }, 60_000);

  it('offers nothing when the sign-in stays where it was', async () => {
    await send('/wrong', { email: 'riley@example.com', password: 'mistyped' });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await offer()).toBeNull();
  }, 60_000);

  it('carries the username over from a step before the password', async () => {
    await send('/step-one', { identifier: 'riley@example.com' });
    const stepTwo = `${origin}/step-two`;
    await copacetic.until(() => isShowing(stepTwo), 10_000);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await copacetic.inOpenPage(
      stepTwo,
      `(() => { document.querySelector('[name="password"]').value = 'second step'; document.querySelector('button').click(); return 'sent'; })()`,
    );
    expect(await copacetic.until(async () => (await offer()) !== null, 10_000)).toBe(true);
    const offered = await offer();
    expect(offered).toMatchObject({ username: 'riley@example.com' });
    await copacetic.chrome.evaluate((id) => window.copacetic.vault.answerSaveOffer(id, 'dismiss'), offered?.id ?? '');
  }, 60_000);

  // Only on CI: on a person's own machine the keychain stops to ask, as the vault's own smoke test says.
  it.runIf(process.env.CI === 'true' && process.platform !== 'linux')(
    'keeps it in the vault when saved',
    async () => {
      await send('/signin', { email: 'saved@example.com', password: 'kept' });
      expect(await copacetic.until(async () => (await offer()) !== null, 10_000)).toBe(true);
      await copacetic.chrome.evaluate(async () => {
        const offered = (await window.copacetic.chrome.getState()).passwordOffer;
        await window.copacetic.vault.answerSaveOffer(offered?.id ?? '', 'save');
      });
      const isSaved = await copacetic.until(
        async () =>
          (await copacetic.chrome.evaluate(() => window.copacetic.vault.list())).entries.some(
            (entry) => entry.username === 'saved@example.com',
          ),
        5_000,
      );
      expect(isSaved).toBe(true);
    },
    60_000,
  );

  it('never watches a Hush tab', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await copacetic.chrome.evaluate(async (target) => {
      const state = await window.copacetic.chrome.getState();
      const hush = state.tabs.find((tab) => tab.id === state.activeTabId && tab.isHush);
      if (hush) {
        await window.copacetic.tabs.navigate(hush.id, target);
      }
    }, `${origin}/signin`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await copacetic.read(
      ({ webContents }, target) =>
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === target && contents.session.isPersistent() === false)
          ?.executeJavaScript(
            `document.querySelector('[name="email"]').value = 'hush@example.com'; document.querySelector('[name="password"]').value = 'unseen'; document.querySelector('button').click();`,
          ),
      `${origin}/signin`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await offer()).toBeNull();
  }, 60_000);

  it('stops offering on a site once told never to', async () => {
    await send('/signin', { email: 'riley@example.com', password: 'first' });
    expect(await copacetic.until(async () => (await offer()) !== null, 10_000)).toBe(true);
    await copacetic.chrome.evaluate(async () => {
      const offered = (await window.copacetic.chrome.getState()).passwordOffer;
      await window.copacetic.vault.answerSaveOffer(offered?.id ?? '', 'never');
    });
    const neverOn = await copacetic.until(
      async () =>
        (await copacetic.chrome.evaluate(async () => (await window.copacetic.chrome.getState()).settings))
          .neverSavePasswordsOn.length > 0,
      5_000,
    );
    expect(neverOn).toBe(true);
    await send('/signin', { email: 'riley@example.com', password: 'second' });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await offer()).toBeNull();
  }, 60_000);
});
