// Libs
import {
  type DecryptStringAsyncReturnValue,
  Notification,
  type NotificationConstructorOptions,
  type ShortcutDetails,
  type SystemMemoryInfo,
  type UtilityProcess,
  clipboard as electronClipboard,
  desktopCapturer as electronDesktopCapturer,
  nativeTheme,
  powerMonitor as electronPowerMonitor,
  safeStorage,
  shell as electronShell,
  systemPreferences,
  utilityProcess,
} from 'electron';

export type ThemeSource = 'system' | 'light' | 'dark';
export type KeychainBackend = ReturnType<typeof safeStorage.getSelectedStorageBackend>;

/** The desktop: other apps, the file manager and the places it lists apps. */
export const shell = {
  openExternal: (url: string): Promise<void> => electronShell.openExternal(url),
  /** Resolves with an error message, or an empty string when the file opened. */
  openPath: (path: string): Promise<string> => electronShell.openPath(path),
  showItemInFolder: (path: string): void => electronShell.showItemInFolder(path),
  /** Windows only: writes a Start menu or desktop shortcut, and resolves whether it did. */
  writeShortcutLink: (path: string, details: ShortcutDetails): boolean =>
    electronShell.writeShortcutLink(path, 'create', details),
};

export const clipboard = {
  readText: (): Promise<string> => electronClipboard.readText(),
  writeText: (text: string): Promise<void> => electronClipboard.writeText(text),
  clear: (): void => electronClipboard.clear(),
};

export const powerMonitor = {
  /** Whether the person has been away for `seconds`, or the screen is locked. */
  idleState: (seconds: number): 'active' | 'idle' | 'locked' | 'unknown' =>
    electronPowerMonitor.getSystemIdleState(seconds),
  on: (event: 'lock-screen' | 'suspend', listener: () => void): void => {
    if (event === 'lock-screen') {
      electronPowerMonitor.on('lock-screen', listener);
    } else {
      electronPowerMonitor.on('suspend', listener);
    }
  },
};

export const desktopCapturer = {
  /** The screens and windows a page could be shown, by id and name. */
  sources: async (): Promise<{ id: string; name: string }[]> =>
    (
      await electronDesktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      })
    ).map((source) => ({ id: source.id, name: source.name })),
};

/** Light or dark for the whole app: native menus, dialogs, scrollbars and the chrome's own `prefers-color-scheme`. */
export const theme = {
  setSource: (source: ThemeSource): void => {
    nativeTheme.themeSource = source;
  },
  isDark: (): boolean => nativeTheme.shouldUseDarkColors,
  /** Calls `listener` whenever the effective theme changes, and resolves to a function that stops it. */
  onChange: (listener: () => void): (() => void) => {
    nativeTheme.on('updated', listener);
    return () => {
      nativeTheme.removeListener('updated', listener);
    };
  },
};

/** The system keychain, which seals the vault's key; only reachable once the app is ready. */
export const keychain = {
  isAvailable: (): Promise<boolean> => safeStorage.isAsyncEncryptionAvailable(),
  backend: (): KeychainBackend => safeStorage.getSelectedStorageBackend(),
  seal: (plainText: string): Promise<Buffer> => safeStorage.encryptStringAsync(plainText),
  open: (sealed: Buffer): Promise<DecryptStringAsyncReturnValue> => safeStorage.decryptStringAsync(sealed),
};

/** Touch ID, on a Mac that has it. */
export const biometrics = {
  isAvailable: (): boolean => systemPreferences.canPromptTouchID?.() ?? false,
  prompt: (reason: string): Promise<void> => systemPreferences.promptTouchID(reason),
};

export interface EngineNotification {
  on(event: 'click' | 'close', listener: () => void): unknown;
  show(): void;
}

/** A system notification, or null where the system has none to show. */
export function createNotification(options: NotificationConstructorOptions): EngineNotification | null {
  return Notification.isSupported() ? new Notification(options) : null;
}

export type EngineUtilityProcess = Pick<UtilityProcess, 'kill' | 'on' | 'postMessage'>;

/** A script run in a process of its own, sandboxed from the main one. */
export function forkUtilityProcess(modulePath: string, serviceName: string): EngineUtilityProcess {
  return utilityProcess.fork(modulePath, [], { serviceName });
}

/** The folder the packaged app's resources live in. */
export function resourcesPath(): string {
  return process.resourcesPath;
}

/** The operating system's own version, or null outside the engine, where plain Node has no way to ask. */
export function systemVersion(): string | null {
  return typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : null;
}

/** Memory in kilobytes; macOS also counts the file cache and purgeable memory it can take back. */
export function systemMemoryInfo(): SystemMemoryInfo {
  return process.getSystemMemoryInfo();
}

/** The versions of the engine and of the Chromium inside it. */
export function engineVersions(): { electron: string; chromium: string } {
  return { electron: process.versions.electron, chromium: process.versions.chrome };
}
