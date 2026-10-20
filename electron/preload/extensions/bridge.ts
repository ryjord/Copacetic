// Libs
import { contextBridge, ipcRenderer } from 'electron';

// Utils
import { installChromePolyfill } from './polyfill';
import { EXTENSION_CHANNEL, EXTENSION_EVENT_CHANNEL } from '../../shared/extensions/channels';

/**
 * Gives an extension's worker or page the parts of the API Electron lacks.
 *
 * Registered for a whole session, so it also runs in every website's own
 * service worker there: anywhere that is not an extension it does nothing at
 * all, and it is only registered once an extension is installed.
 */
export function provideChromeApi(protocol: unknown): void {
  if (protocol !== 'chrome-extension:') {
    return;
  }
  contextBridge.exposeInMainWorld('__copaceticExtensions', {
    invoke: (method: string, args: unknown[]) => ipcRenderer.invoke(EXTENSION_CHANNEL, method, args),
    onEvent: (listener: (name: string, args: unknown[]) => void) =>
      ipcRenderer.on(EXTENSION_EVENT_CHANNEL, (_event, name: string, args: unknown[]) => listener(name, args)),
  });
  contextBridge.executeInMainWorld({ func: installChromePolyfill });
}
