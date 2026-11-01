// Libs
import { type App, app as electronApp, nativeImage } from 'electron';

type AppMember =
  | 'commandLine'
  | 'configureHostResolver'
  | 'exit'
  | 'getAppMetrics'
  | 'getAppPath'
  | 'getLocale'
  | 'getPath'
  | 'getVersion'
  | 'isDefaultProtocolClient'
  | 'isPackaged'
  | 'name'
  | 'on'
  | 'quit'
  | 'removeListener'
  | 'requestSingleInstanceLock'
  | 'setActivationPolicy'
  | 'setAsDefaultProtocolClient'
  | 'setName'
  | 'setPath'
  | 'userAgentFallback'
  | 'whenReady';

/** The running application: its lifecycle, folders, identity and command line; a port implements this and no more. */
export type EngineApp = Pick<App, AppMember>;

// Reads Electron's app only when used, as a plain import does; tests that mock part of Electron rely on that.
export const app = new Proxy<EngineApp>(Object.create(null), {
  get: (_target, key) => {
    const value: unknown = Reflect.get(electronApp, key);
    return typeof value === 'function' ? value.bind(electronApp) : value;
  },
  set: (_target, key, value) => Reflect.set(electronApp, key, value),
});

/** The Dock icon on macOS; nothing elsewhere. */
export function setDockIcon(iconPath: string): void {
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    electronApp.dock?.setIcon(icon);
  }
}
