import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;

// localhost and 127.0.0.1 are two sites, so the frame gets a process of its own, and both are secure contexts.
const FRAMED_PAGE = (port: number) => `<body><iframe src="http://127.0.0.1:${port}/frame"></iframe></body>`;

// What a worker says about itself, and a request it makes, which a server sees with the worker's own user agent.
const WORKER_SCRIPT = `(async () => {
  const out = { userAgent: navigator.userAgent, present: typeof navigator.userAgentData };
  if (navigator.userAgentData) {
    out.brands = navigator.userAgentData.brands.map((b) => b.brand).join('|');
    out.platform = navigator.userAgentData.platform;
  }
  await fetch('/from-worker');
  postMessage(out);
})();`;
const WORKER_PAGE =
  "<body><script>window.workerReport = new Promise((resolve) => { new Worker('/worker.js').onmessage = (event) => resolve(event.data); });</script></body>";

/** The headers each request arrived with, by path, as a server sees them before any script runs. */
const receivedHeaders = new Map<string, Record<string, string | string[] | undefined>>();

beforeAll(async () => {
  server = createServer((request, response) => {
    receivedHeaders.set(request.url ?? '', request.headers);
    if (request.url === '/worker.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(WORKER_SCRIPT);
      return;
    }
    response.setHeader('content-type', 'text/html');
    const port = (server.address() as AddressInfo).port;
    const pages: Record<string, string> = { '/frame': '<body>frame</body>', '/worker-page': WORKER_PAGE };
    response.end(pages[request.url ?? ''] ?? FRAMED_PAGE(port));
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

/**
 * Every Chromium upgrade can quietly change which targets the description
 * reaches, as the Cloudflare frame showed. So each part of a tab is asked what
 * it is, and the server is asked what it was told, and all of it must agree.
 */
describe('a worker the tab starts, and what the server is told', () => {
  it('describes itself exactly as the tab does, in its navigator and on the wire', async () => {
    const port = (server.address() as AddressInfo).port;
    const page = `http://localhost:${port}/worker-page`;
    const tab = await copacetic.inPage<Record<string, unknown>>(page, REPORT);
    const worker = await copacetic.inOpenPage<Record<string, unknown>>(page, 'window.workerReport');

    expect(worker.present).toBe('object');
    expect(worker.userAgent).toBe(tab.userAgent);
    expect(worker.brands).toBe(tab.brands);
    expect(worker.platform).toBe(tab.platform);

    // The server saw the same user agent the page and the worker report, before any script of theirs ran.
    expect(receivedHeaders.get('/worker-page')?.['user-agent']).toBe(tab.userAgent);
    expect(receivedHeaders.get('/worker.js')?.['user-agent']).toBe(tab.userAgent);
    expect(receivedHeaders.get('/from-worker')?.['user-agent']).toBe(tab.userAgent);
    expect(String(receivedHeaders.get('/from-worker')?.['user-agent'])).not.toMatch(/electron|copacetic/i);
  });
});
