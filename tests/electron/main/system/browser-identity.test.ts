// Libs
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../electron/main/system/diagnostics', () => ({
  log: { warn: () => {} },
  describeError: (error: unknown) => String(error),
}));

// Utils
import { describeTab } from '../../../../electron/main/system/browser-identity';
import { CHROME_OBJECT_SCRIPT } from '../../../../electron/shared/browsing/browser-identity';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

type Listener = (event: unknown, method: string, parameters: unknown) => void;

/** A tab whose debugger records each command, and fails the ones `isRefused` names. */
function fakeTab(isRefused: (method: string, sessionId?: string) => boolean = () => false) {
  const sent: { method: string; parameters: object; sessionId?: string }[] = [];
  let listener: Listener = () => {};
  const contents = {
    isDestroyed: () => false,
    session: { getUserAgent: () => CHROME_MAC },
    debugger: {
      attach: () => {},
      on: (_name: string, handler: Listener) => {
        listener = handler;
      },
      sendCommand: async (method: string, parameters: object, sessionId?: string) => {
        sent.push({ method, parameters, sessionId });
        if (isRefused(method, sessionId)) {
          throw new Error(`${method} refused`);
        }
        return {};
      },
    },
  };
  const attach = async (sessionId: string, type: string) => {
    listener({}, 'Target.attachedToTarget', { sessionId, targetInfo: { type } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const sentTo = (sessionId?: string) => sent.filter((command) => command.sessionId === sessionId);
  return { contents: contents as never, attach, sentTo };
}

/**
 * Site isolation puts a frame from another site in a target of its own, which
 * the tab's override never reached. Cloudflare's challenge is such a frame: it
 * said Electron while its requests said Chrome, and refused every click.
 */
describe('the frames inside a tab', () => {
  it('are told what the tab was told, then let go', async () => {
    const { contents, attach, sentTo } = fakeTab();
    await describeTab(contents, 'darwin');
    await attach('frame-1', 'iframe');

    const tabOverride = sentTo(undefined).find((command) => command.method === 'Emulation.setUserAgentOverride');
    const frame = sentTo('frame-1');
    expect(frame.find((command) => command.method === 'Emulation.setUserAgentOverride')?.parameters).toEqual(
      tabOverride?.parameters,
    );
    expect(frame.find((command) => command.method === 'Page.addScriptToEvaluateOnNewDocument')?.parameters).toEqual({
      source: CHROME_OBJECT_SCRIPT,
    });
    // Its own frames attach to it, not to the tab.
    expect(frame.map((command) => command.method)).toContain('Target.setAutoAttach');
    expect(frame.at(-1)?.method).toBe('Runtime.runIfWaitingForDebugger');
  });

  it('describes a worker through the network override, which is the one a worker has', async () => {
    const { contents, attach, sentTo } = fakeTab();
    await describeTab(contents, 'darwin');
    await attach('worker-1', 'worker');
    expect(sentTo('worker-1').map((command) => command.method)).toEqual([
      'Network.setUserAgentOverride',
      'Runtime.runIfWaitingForDebugger',
    ]);
  });

  // Every page of its site shares a service worker, and one held for a tab was closed under it.
  it('lets a service worker go at once, and leaves it alone', async () => {
    const { contents, attach, sentTo } = fakeTab();
    await describeTab(contents, 'darwin');
    await attach('service-1', 'service_worker');
    expect(sentTo('service-1').map((command) => command.method)).toEqual(['Runtime.runIfWaitingForDebugger']);
    expect(sentTo(undefined).at(-1)).toMatchObject({
      method: 'Target.detachFromTarget',
      parameters: { sessionId: 'service-1' },
    });
  });

  // A frame held at its start and never let go is a blank square in the page.
  it('lets a frame go even when describing it fails', async () => {
    const { contents, attach, sentTo } = fakeTab(
      (method, sessionId) => sessionId === 'frame-1' && method !== 'Runtime.runIfWaitingForDebugger',
    );
    await describeTab(contents, 'darwin');
    await attach('frame-1', 'iframe');
    expect(sentTo('frame-1').at(-1)?.method).toBe('Runtime.runIfWaitingForDebugger');
  });
});
