import { afterEach, describe, expect, it, vi } from 'vitest';

import { installChromePolyfill } from '../../../../electron/preload/extensions/polyfill';

type Listener = (name: string, args: unknown[]) => void;

function world(chrome: Record<string, unknown>) {
  let deliver: Listener = () => {};
  const invoke = vi.fn(async (method: string) => (method === 'tabs.query' ? [{ id: 1 }] : null));
  Reflect.set(globalThis, 'chrome', chrome);
  Reflect.set(globalThis, '__copaceticExtensions', { invoke, onEvent: (listener: Listener) => (deliver = listener) });
  installChromePolyfill();
  return { invoke, send: (name: string, args: unknown[]) => deliver(name, args) };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
  Reflect.deleteProperty(globalThis, '__copaceticExtensions');
});

describe("the parts of Chrome's API Electron leaves out", () => {
  it('fills in a missing method, answered by the main process', async () => {
    const chrome: Record<string, Record<string, unknown>> = { tabs: {} };
    const { invoke } = world(chrome);
    const query = chrome.tabs?.query as (info: unknown) => Promise<unknown>;
    expect(await query({ active: true })).toEqual([{ id: 1 }]);
    expect(invoke).toHaveBeenCalledWith('tabs.query', [{ active: true }]);
  });

  // Electron's own sendMessage reaches content scripts; replacing it would break them.
  it('leaves alone what Electron already has', () => {
    const sendMessage = () => 'native';
    const chrome: Record<string, Record<string, unknown>> = { tabs: { sendMessage } };
    world(chrome);
    expect(chrome.tabs?.sendMessage).toBe(sendMessage);
  });

  // Electron's own tabs.query and action know nothing of Copacetic's tabs or toolbar, so ours stand in for them.
  it('replaces the tabs and toolbar calls Electron has its own versions of', () => {
    const query = () => 'native';
    const setBadgeText = () => 'native';
    const chrome: Record<string, Record<string, unknown>> = { tabs: { query }, action: { setBadgeText } };
    world(chrome);
    expect(chrome.tabs?.query).not.toBe(query);
    expect(chrome.action?.setBadgeText).not.toBe(setBadgeText);
  });

  it('answers a callback as well as a promise, for older extensions', async () => {
    const chrome: Record<string, Record<string, unknown>> = { tabs: {} };
    world(chrome);
    const answered = await new Promise((resolve) =>
      (chrome.tabs?.query as (info: unknown, done: (value: unknown) => void) => void)({}, resolve),
    );
    expect(answered).toEqual([{ id: 1 }]);
  });

  it('delivers an event to the listeners added for it', () => {
    const chrome: Record<string, Record<string, unknown>> = { tabs: {} };
    const { send, invoke } = world(chrome);
    const listener = vi.fn();
    (chrome.tabs?.onRemoved as { addListener: (listener: unknown) => void }).addListener(listener);
    expect(invoke).toHaveBeenCalledWith('events.listen', ['tabs.onRemoved']);
    send('tabs.onRemoved', [42, { windowId: 1 }]);
    expect(listener).toHaveBeenCalledWith(42, { windowId: 1 });
  });

  // Electron defines storage.sync and refuses every call to it.
  it('keeps sync storage on this machine', () => {
    const local = { get: () => {} };
    const chrome: Record<string, Record<string, unknown>> = { storage: { local, sync: { refuses: true } } };
    world(chrome);
    expect(chrome.storage?.sync).toBe(local);
  });

  it('does nothing without the bridge, as in a website’s own worker', () => {
    const chrome: Record<string, Record<string, unknown>> = { tabs: {} };
    Reflect.set(globalThis, 'chrome', chrome);
    installChromePolyfill();
    expect(chrome.tabs?.query).toBeUndefined();
  });
});
