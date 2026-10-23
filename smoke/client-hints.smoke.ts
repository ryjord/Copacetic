import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;

// localhost and 127.0.0.1 are two sites, so the frame gets a process of its own, and both are secure contexts.
const FRAMED_PAGE = (port: number) => `<body><iframe src="http://127.0.0.1:${port}/frame"></iframe></body>`;

beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(
      request.url === '/frame' ? '<body>frame</body>' : FRAMED_PAGE((server.address() as AddressInfo).port),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  copacetic = await SmokeApp.launch();
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

/**
 * Client hints exist only in a secure context, so this has to be a real https
 * page in a real tab. Reading them anywhere else reports them missing and means
 * nothing - which is exactly the mistake that made this look impossible.
 */
const REPORT = `(async () => {
  const out = { secure: isSecureContext, present: typeof navigator.userAgentData };
  if (navigator.userAgentData) {
    out.brands = navigator.userAgentData.brands.map((b) => b.brand).join('|');
    out.platform = navigator.userAgentData.platform;
    const high = await navigator.userAgentData.getHighEntropyValues(['uaFullVersion']);
    out.uaFullVersion = high.uaFullVersion;
  }
  out.userAgent = navigator.userAgent;
  out.leakedRequire = typeof window.require;
  out.leakedProcess = typeof window.process;
  out.leakedBridge = typeof window.copacetic;
  return out;
})()`;

describe('a tab describes itself consistently', () => {
  it('is a secure context, where the hints exist at all', async () => {
    const seen = await copacetic.inPage<{ secure: boolean; present: string }>('https://example.com/', REPORT);
    expect(seen.secure).toBe(true);
    expect(seen.present).toBe('object');
  });

  it('claims the Chrome brand its user agent claims', async () => {
    const seen = await copacetic.inPage<{ brands: string }>('https://example.com/', REPORT);
    expect(seen.brands).toContain('Google Chrome');
    expect(seen.brands).toContain('Chromium');
  });

  // As Chrome does: the user agent is cut to the major version, and the full build is answered when asked.
  it('reports the same major version in both, and the real build in the hints', async () => {
    const seen = await copacetic.inPage<{ uaFullVersion: string; userAgent: string }>('https://example.com/', REPORT);
    const major = seen.uaFullVersion.split('.')[0];
    expect(seen.userAgent).toContain(`Chrome/${major}.0.0.0`);
    expect(seen.uaFullVersion).toMatch(/^\d+\.0\.[1-9]\d*\.\d+$/);
  });

  // A beta's version once left `-beta.1` in the string: a user agent nobody else sends.
  it('says Chrome and nothing else, and only its major version', async () => {
    const seen = await copacetic.inPage<{ userAgent: string }>('https://example.com/', REPORT);
    expect(seen.userAgent).not.toMatch(/copacetic|electron|beta/i);
    expect(seen.userAgent).toMatch(/Chrome\/\d+\.0\.0\.0 /);
  });

  // The correction is made in the main process, so page content still runs
  // nothing of ours and has nothing of ours to reach.
  it('still has no way into the app', async () => {
    const seen = await copacetic.inPage<Record<string, string>>('https://example.com/', REPORT);
    expect(seen.leakedRequire).toBe('undefined');
    expect(seen.leakedProcess).toBe('undefined');
    expect(seen.leakedBridge).toBe('undefined');
  });
});

/**
 * Site isolation gives a frame from another site a process and a DevTools
 * target of its own, which the tab's description never reached. Cloudflare's
 * challenge is such a frame: it said Electron while its requests said Chrome,
 * and no click on it ever passed.
 */
describe('a frame from another site', () => {
  it('describes itself exactly as the tab around it does', async () => {
    const port = (server.address() as AddressInfo).port;
    const page = `http://localhost:${port}/`;
    const tab = await copacetic.inPage<Record<string, unknown>>(page, REPORT);
    const frame = await copacetic.read(
      async ({ webContents }, options) => {
        const contents = webContents
          .getAllWebContents()
          .filter((candidate) => candidate.getURL().startsWith(options.page))
          .at(-1);
        const frameOf = () => contents?.mainFrame.frames.find((candidate) => candidate.url.includes('/frame'));
        for (let waited = 0; !frameOf() && waited < 10_000; waited += 100) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const framed = frameOf();
        return {
          isOwnProcess: framed !== undefined && framed.processId !== contents?.mainFrame.processId,
          seen: (await framed?.executeJavaScript(
            `${options.report}.then((out) => ({ ...out, chrome: Object.keys(window.chrome ?? {}).join(',') }))`,
          )) as Record<string, unknown>,
        };
      },
      { page, report: REPORT },
    );
    expect(frame.isOwnProcess).toBe(true);
    expect(frame.seen.userAgent).toBe(tab.userAgent);
    expect(frame.seen.brands).toBe(tab.brands);
    expect(frame.seen.platform).toBe(tab.platform);
    expect(frame.seen.chrome).toBe('csi,loadTimes,app');
  });
});
