import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pictureInPictureScript } from '../electron/main/tabs/picture-in-picture';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;

// A video fed from a canvas, so the test needs no media file and no network: it plays as soon as the page loads.
const VIDEO_PAGE = `<body>
<canvas width="160" height="90"></canvas>
<video muted autoplay playsinline width="320" height="180"></video>
<script>
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  let frame = 0;
  setInterval(() => { context.fillStyle = frame++ % 2 ? '#123456' : '#654321'; context.fillRect(0, 0, 160, 90); }, 50);
  const video = document.querySelector('video');
  video.srcObject = canvas.captureStream(20);
  video.play();
</script>
</body>`;

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(VIDEO_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  copacetic = await SmokeApp.launch();
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

/** Runs the script the menu runs, in the world and with the gesture it is run with, in the page at this address. */
const runScript = (url: string) =>
  copacetic.main(
    async ({ webContents }, options) => {
      const page = webContents
        .getAllWebContents()
        .filter((contents) => contents.getURL().startsWith(options.url))
        .at(-1);
      return page?.executeJavaScriptInIsolatedWorld(1032, [{ code: options.code }], true);
    },
    { url, code: pictureInPictureScript(null) },
  );

/**
 * The unit tests run the script against a stand-in document. This asks real
 * Chromium, where requestPictureInPicture has rules of its own about gestures
 * and worlds that a stand-in cannot know.
 */
describe('picture in picture in a real page', () => {
  it('puts the playing video into picture in picture, and brings it back when asked again', async () => {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const isPlaying = 'document.querySelector("video").readyState > 0';
    expect(await copacetic.inPage<boolean>(url, isPlaying)).toBeDefined();
    expect(await copacetic.until(async () => copacetic.inOpenPage<boolean>(url, isPlaying), 10_000)).toBe(true);

    expect(await runScript(url)).toBe('entered');
    expect(await copacetic.inOpenPage<boolean>(url, 'document.pictureInPictureElement !== null')).toBe(true);

    expect(await runScript(url)).toBe('left');
    expect(await copacetic.inOpenPage<boolean>(url, 'document.pictureInPictureElement === null')).toBe(true);
  }, 60_000);
});
