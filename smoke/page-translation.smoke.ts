import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;

beforeAll(async () => {
  site = await startLocalSite((_request, response) => {
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<!doctype html><html lang="de"><title>Seite</title><p id="text">Der Browser behält nichts.</p></html>');
  });
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ httpsFirst: false }));
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

/**
 * Translate this page, from the menu, in the real worker with a real model: the
 * path from the click to text changed in the page, which no unit test walks.
 */
describe('translating a whole page', () => {
  it('translates the page in front into English when its menu item is chosen', async () => {
    const page = `${site.origin}/seite`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    await copacetic.inOpenPage(page, 'document.readyState');

    await copacetic.chooseMenuItem('Translate this page, or show the original');
    const text = () => copacetic.inOpenPage<string>(page, `document.getElementById('text').textContent`);
    const changed = await copacetic.until(async () => !(await text()).includes('behält'), 180_000);
    expect(changed, `the page still read "${await text()}"`).toBe(true);
    expect(await text()).toMatch(/browser/i);
  }, 240_000);

  const offerFor = async () => {
    const pending = await copacetic.chrome.evaluate(() => window.copacetic.notices.pending());
    return pending.find((notice) => notice.key === 'page-translation-offer');
  };

  it('offers to translate a page in another language once it loads, and translates it on yes', async () => {
    const page = `${site.origin}/angebot`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    expect(await copacetic.until(async () => (await offerFor()) !== undefined, 20_000)).toBe(true);
    const offer = await offerFor();
    expect(offer?.message).toBe('This page is in German. Translate it into English, on this machine?');

    await copacetic.chrome.evaluate((id) => window.copacetic.notices.answer(id, true), offer?.id ?? '');
    const text = () => copacetic.inOpenPage<string>(page, `document.getElementById('text').textContent`);
    expect(await copacetic.until(async () => !(await text()).includes('behält'), 180_000)).toBe(true);
  }, 240_000);

  it('never offers that language again once an offer is turned down', async () => {
    const page = `${site.origin}/abgelehnt`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    expect(await copacetic.until(async () => (await offerFor()) !== undefined, 20_000)).toBe(true);
    await copacetic.chrome.evaluate(
      async (id) => window.copacetic.notices.answer(id, false),
      (await offerFor())?.id ?? '',
    );
    const neverFrom = () =>
      copacetic.chrome.evaluate(async () => (await window.copacetic.settings.get()).neverOfferTranslationFrom);
    expect(await copacetic.until(async () => (await neverFrom()).includes('de'), 10_000)).toBe(true);

    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `${site.origin}/wieder`);
    await copacetic.inOpenPage(`${site.origin}/wieder`, 'document.readyState');
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(await offerFor()).toBeUndefined();
  }, 60_000);
});
