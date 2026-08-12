import { BrowserWindow, screen } from 'electron';
import { existsSync } from 'node:fs';
import { PersistedFile, asBoolean, asNumber, isRecord } from './persistence';
import { devIconPath, isDevelopment, preloadPath } from './env';
import { guardChromeWebContents } from './security';

interface WindowBounds {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  isMaximized: boolean;
}

const DEFAULT_BOUNDS: WindowBounds = { width: 1280, height: 820, x: null, y: null, isMaximized: false };
const MIN_WIDTH = 720;
const MIN_HEIGHT = 480;

/** Surface colour behind everything, so resizing never flashes white. */
export const CHROME_BACKGROUND = '#0b0f14';

export function createChromeWindow(): BrowserWindow {
  const boundsFile = new PersistedFile<WindowBounds>('window.json', () => ({ ...DEFAULT_BOUNDS }), reviveBounds, 600);
  const saved = clampToVisibleDisplay(boundsFile.get());

  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== null && saved.y !== null ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: CHROME_BACKGROUND,
    show: false,
    // Windows and Linux read the icon off the window itself. Packaged builds
    // get it from the installer, so this only matters while developing.
    ...(isDevelopment() && process.platform !== 'darwin' && existsSync(devIconPath()) ? { icon: devIconPath() } : {}),
    // The tab strip doubles as the title bar, so the traffic lights sit inside
    // it on macOS and the chrome draws its own controls elsewhere.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    ...(process.platform !== 'darwin' ? { titleBarOverlay: false, frame: false } : {}),
    webPreferences: {
      preload: preloadPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      // The chrome is a fixed-scale interface; page zoom belongs to tabs.
      zoomFactor: 1,
    },
  });

  if (saved.isMaximized) {
    window.maximize();
  }
  guardChromeWebContents(window.webContents);

  const persist = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
      return;
    }
    const isMaximized = window.isMaximized();
    const [x, y] = window.getPosition();
    const [width, height] = window.getNormalBounds
      ? [window.getNormalBounds().width, window.getNormalBounds().height]
      : window.getSize();
    boundsFile.set({
      width: width ?? DEFAULT_BOUNDS.width,
      height: height ?? DEFAULT_BOUNDS.height,
      x: isMaximized ? saved.x : (x ?? null),
      y: isMaximized ? saved.y : (y ?? null),
      isMaximized,
    });
  };

  window.on('resize', persist);
  window.on('move', persist);
  window.on('maximize', persist);
  window.on('unmaximize', persist);
  window.on('close', () => boundsFile.flush());

  return window;
}

// A window restored onto a display that no longer exists is invisible and unrecoverable without editing config by hand.
function clampToVisibleDisplay(bounds: WindowBounds): WindowBounds {
  if (bounds.x === null || bounds.y === null) {
    return bounds;
  }

  const isOnSomeDisplay = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x! < area.x + area.width &&
      bounds.x! + bounds.width > area.x &&
      bounds.y! < area.y + area.height &&
      bounds.y! + bounds.height > area.y
    );
  });

  return isOnSomeDisplay ? bounds : { ...bounds, x: null, y: null };
}

function reviveBounds(raw: unknown): WindowBounds | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    width: Math.max(MIN_WIDTH, asNumber(raw.width, DEFAULT_BOUNDS.width)),
    height: Math.max(MIN_HEIGHT, asNumber(raw.height, DEFAULT_BOUNDS.height)),
    x: typeof raw.x === 'number' ? raw.x : null,
    y: typeof raw.y === 'number' ? raw.y : null,
    isMaximized: asBoolean(raw.isMaximized, false),
  };
}
