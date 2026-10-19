import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let pdfUrl = '';

// The smallest document a PDF reader accepts: one blank page.
const BLANK_PDF = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF',
].join('\n');

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/pdf' });
    response.end(BLANK_PDF);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  pdfUrl = `http://127.0.0.1:${port}/document.pdf`;

  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  await new Promise((resolve) => server?.close(resolve));
});

const until = async (condition: () => Promise<boolean>, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

/** Electron leaves plugins off, and its PDF viewer is one, so a PDF link used to download instead of opening. */
describe('a PDF', () => {
  it('opens in the tab, in the built-in viewer, rather than downloading', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), pdfUrl);
    // The viewer is an extension page, either a frame inside the tab or a contents of its own.
    const viewerPages = () =>
      copacetic.main(({ webContents }) =>
        webContents
          .getAllWebContents()
          .flatMap((contents) => [
            contents.getURL(),
            ...(contents.mainFrame?.framesInSubtree.map((frame) => frame.url) ?? []),
          ])
          .filter((url) => url.startsWith('chrome-extension://') || url.startsWith('chrome://')),
      );
    const isViewerOpen = await until(async () => (await viewerPages()).length > 0);

    const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    expect(state.downloads.map((download) => download.filename)).toEqual([]);
    expect(state.tabs.some((tab) => tab.url === pdfUrl)).toBe(true);
    expect(isViewerOpen, JSON.stringify(await viewerPages())).toBe(true);
  }, 60_000);
});
