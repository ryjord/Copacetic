import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Server, createServer } from 'node:http';
import { SmokeApp } from './support/harness';

// A one-pixel PNG, served beside a page so an article's image has somewhere real to come from.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
let server: Server;
let origin = '';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/reader';

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/pixel.png') {
      response.writeHead(200, { 'content-type': 'image/png' }).end(PIXEL);
      return;
    }
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<!doctype html><title>Local</title><p>Local page</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

describe('reader view', () => {
  it('reads the page as it stands, through DevTools rather than a script in it', async () => {
    const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
    // Changed after load, so only a read of the live document would see it.
    await copacetic.inOpenPage(
      PAGE,
      "document.body.insertAdjacentHTML('beforeend', '<p id=late>Added later</p>'), true",
    );

    const document = await copacetic.chrome.evaluate((id) => window.copacetic.tabs.readerDocument(id), tabId);
    expect(document?.url).toBe(PAGE);
    expect(document?.html).toContain('Added later');

    const globals = await copacetic.inOpenPage<string[]>(
      PAGE,
      "Object.keys(window).filter((key) => key.toLowerCase().includes('copacetic') || key.toLowerCase().includes('readability'))",
    );
    expect(globals).toEqual([]);
  }, 90_000);

  // Fetched in the tab's own session, so a host the blocker refuses on the page is refused here too.
  it('fetches an article image through the page session, and blocking still applies', async () => {
    const page = `${origin}/article`;
    const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    await copacetic.inOpenPage(page, 'true');
    const image = `${origin}/pixel.png`;
    const tracker = 'https://www.google-analytics.com/collect.gif';
    const fetched = await copacetic.chrome.evaluate(({ id, urls }) => window.copacetic.tabs.readerImages(id, urls), {
      id: tabId,
      urls: [image, tracker],
    });
    expect(fetched[image]).toMatch(/^data:image\/png;base64,/);
    expect(fetched[tracker]).toBeUndefined();
  }, 90_000);
});
