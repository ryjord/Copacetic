import { describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '../../../electron/shared/ipc-contract';

const registered = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

// Everything the handlers module touches at import time, and nothing it does when called.
vi.mock('electron', () => {
  const anything: unknown = new Proxy(() => anything, { get: () => anything, apply: () => anything });
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => registered.set(channel, handler),
      removeHandler: (channel: string) => registered.delete(channel),
    },
    app: anything,
    Menu: anything,
    MenuItem: anything,
    BrowserWindow: anything,
    clipboard: anything,
    dialog: anything,
    nativeImage: anything,
    shell: anything,
    session: anything,
    safeStorage: anything,
  };
});

const { registerIpcHandlers, removeIpcHandlers } = await import('../../../electron/main/app/ipc');

/**
 * The chrome can call exactly what the contract lists, and every entry has a
 * handler behind it. A method in the API with no handler fails at the moment
 * someone clicks it; this fails here instead.
 */
describe('the IPC contract', () => {
  it('has a handler for every method and nothing besides', () => {
    const browser = new Proxy({}, { get: () => () => undefined });
    registerIpcHandlers(browser as never);
    expect([...registered.keys()].sort()).toEqual(Object.values(CHANNELS).sort());
  });

  it('gives every method a channel of its own', () => {
    const channels = Object.values(CHANNELS);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('refuses a call from anywhere but the browser’s own frames', async () => {
    registered.clear();
    const browser = new Proxy(
      { isOwnFrame: () => false },
      { get: (target, key) => (key in target ? Reflect.get(target, key) : () => undefined) },
    );
    registerIpcHandlers(browser as never);
    const handler = registered.get(CHANNELS['tabs.close'])!;
    expect(() => handler({ senderFrame: {} }, 'tab-id')).toThrow(/unexpected frame/);
  });

  it('can take every handler away again', () => {
    removeIpcHandlers();
    expect(registered.size).toBe(0);
  });
});
