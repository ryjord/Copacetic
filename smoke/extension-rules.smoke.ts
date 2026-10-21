import { type Server, createServer } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let origin = '';
const RULES = path.resolve('smoke/fixtures/extensions/rules');
// Every path the test page asked for that actually reached the network.
const arrived: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    arrived.push(request.url ?? '');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', request.url === '/' ? 'text/html' : 'text/plain');
    response.end(request.url === '/' ? '<title>rules page</title>' : 'reached');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.main(({ dialog, session }, folder) => {
    const said: string[] = [];
    Reflect.set(globalThis, 'workerSaid', said);
    session
      .fromPartition('persist:copacetic-web')
      .serviceWorkers.on('console-message', (_event, details) => said.push(details.message));
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  }, RULES);
  expect(await copacetic.chrome.evaluate(() => window.copacetic.extensions.addFromFolder())).toBe('');
  // The refusal is the worker's last call, so by then its own rule is in.
  const isReady = await copacetic.until(
    async () =>
      (await copacetic.read(() => (Reflect.get(globalThis, 'workerSaid') as string[]).join('\n'))).includes(
        'rules: a bad rule was refused',
      ),
    20_000,
  );
  expect(isReady).toBe(true);
}, 120_000);

afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

const fetchAll = (paths: string[]) =>
  copacetic.inPage<string>(
    `${origin}/`,
    `Promise.all(${JSON.stringify(paths)}.map((path) => fetch(path).then(() => 'fetched', () => 'failed'))).then((results) => JSON.stringify(results))`,
  );

describe("an extension's declarativeNetRequest rules", () => {
  it('stop what its shipped and its own rules name, and nothing else', async () => {
    arrived.length = 0;
    await fetchAll(['/shipped-block/a', '/shipped-redirect/b', '/dynamic-block/c', '/spare-block/d', '/fine/e']);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(arrived).not.toContain('/shipped-block/a');
    expect(arrived).not.toContain('/shipped-redirect/b');
    expect(arrived).not.toContain('/dynamic-block/c');
    // The ruleset the manifest leaves off, and an ordinary request, both reach the site.
    expect(arrived).toContain('/spare-block/d');
    expect(arrived).toContain('/fine/e');
  }, 60_000);

  // Chrome rejects a rule it cannot use, and an extension that checks the rejection must see it.
  it('refuse a bad rule, as Chrome does', async () => {
    const said = await copacetic.read(() => (Reflect.get(globalThis, 'workerSaid') as string[]).join('\n'));
    expect(said).toContain('rules: a bad rule was refused');
  });

  it('count what they blocked on the toolbar button', async () => {
    const rules = await copacetic.until(async () => {
      const listed = await copacetic.chrome.evaluate(() => window.copacetic.extensions.list());
      const badge = listed.find((extension) => extension.name === 'Copacetic smoke rules')?.action?.badgeText ?? '';
      return Number(badge) > 0;
    }, 10_000);
    expect(rules).toBe(true);
  }, 30_000);

  it('never reach a Hush tab', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await new Promise((resolve) => setTimeout(resolve, 800));
    arrived.length = 0;
    await copacetic.chrome.evaluate(async (target) => {
      const state = await window.copacetic.chrome.getState();
      const hush = state.tabs.find((tab) => tab.id === state.activeTabId && tab.isHush);
      if (hush) {
        await window.copacetic.tabs.navigate(hush.id, target);
      }
    }, `${origin}/`);
    await copacetic.until(
      () =>
        copacetic.read(
          ({ webContents }, target) =>
            webContents
              .getAllWebContents()
              .some((contents) => contents.getURL() === target && contents.session.isPersistent() === false),
          `${origin}/`,
        ),
      10_000,
    );
    await copacetic.read(
      ({ webContents }, target) =>
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === target && contents.session.isPersistent() === false)
          ?.executeJavaScript("fetch('/shipped-block/hush').then(() => 'fetched', () => 'failed')"),
      `${origin}/`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(arrived).toContain('/shipped-block/hush');
  }, 60_000);
});
