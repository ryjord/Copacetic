import { contextBridge, ipcRenderer } from 'electron';
import type { CopaceticApi } from '../shared/api';
import { PUSH, type ChromeSurface, type PushChannel } from '../shared/channels';
import { type ApiMethod, CHANNELS } from '../shared/ipc-contract';
import type { Notice } from '../shared/notices';
import type { BrowserStatePatch } from '../shared/state-slices';

/** One function per entry in the contract, grouped the way the API is. */
function invokers(): Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> {
  const groups: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};
  for (const [method, channel] of Object.entries(CHANNELS) as [ApiMethod, string][]) {
    const [group = '', name = ''] = method.split('.');
    groups[group] ??= {};
    groups[group][name] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
  }
  return groups;
}

// The complete surface the chrome renderer can reach. Built from CHANNELS,
// whose keys the compiler checks against every method of CopaceticApi, which is
// the one thing this cast relies on.
const api = {
  ...invokers(),
  on: {
    state: (listener: (patch: BrowserStatePatch) => void) => subscribe(PUSH.state, listener),
    focusOmnibox: (listener: () => void) => subscribe(PUSH.focusOmnibox, listener),
    openSurface: (listener: (surface: ChromeSurface) => void) => subscribe(PUSH.openSurface, listener),
    renameGroup: (listener: (groupId: string) => void) => subscribe(PUSH.renameGroup, listener),
    bookmarksChanged: (listener: () => void) => subscribe(PUSH.bookmarksChanged, listener),
    notice: (listener: (notice: Notice) => void) => subscribe(PUSH.notice, listener),
    noticeSettled: (listener: (id: string) => void) => subscribe(PUSH.noticeSettled, listener),
    renameBookmarkFolder: (listener: (folderId: string) => void) => subscribe(PUSH.renameBookmarkFolder, listener),
    focusFind: (listener: () => void) => subscribe(PUSH.focusFind, listener),
  },
} as CopaceticApi;

/** Only ever given one of PUSH, so the renderer can listen to nothing else. */
function subscribe<T>(channel: PushChannel, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('copacetic', api);
