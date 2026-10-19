// Libs
import { BrowserWindow, screen } from 'electron';
import { existsSync } from 'node:fs';

// Utils
import { PersistedFile, asBoolean, asNumber, isRecord } from '../data/persistence';
import { devIconPath, isDevelopment, preloadPath } from '../app/env';
import { guardChromeWebContents } from '../security/security';
import { groundColour, titleBarOverlayFor } from './appearance';

// Types
import type { DensityId } from '../../shared/types';

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowBounds {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  isMaximized: boolean;
}

const DEFAULT_BOUNDS: WindowBounds = { width: 1280, height: 820, x: null, y: null, isMaximized: false };
const MIN_WIDTH = 720;
const MIN_HEIGHT = 480;

export function createChromeWindow(density: DensityId): BrowserWindow {
  const boundsFile = new PersistedFile<WindowBounds>('window.json', () => ({ ...DEFAULT_BOUNDS }), reviveBounds, {
    flushDelayMs: 600,
  });
  const saved = clampToVisibleDisplay(
    boundsFile.get(),
    screen.getAllDisplays().map((display) => display.workArea),
  );

  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== null && saved.y !== null ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: groundColour(),
    show: false,
    // Windows and Linux read the icon off the window itself. Packaged builds
    // get it from the installer, so this only matters while developing.
    ...(isDevelopment() && process.platform !== 'darwin' && existsSync(devIconPath()) ? { icon: devIconPath() } : {}),
    // The tab strip doubles as the title bar: the traffic lights sit inside it
    // on macOS, and elsewhere the system draws its own controls over its end.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 14 } : undefined,
    ...(process.platform !== 'darwin' ? { titleBarOverlay: titleBarOverlayFor(density) } : {}),
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

/** A window restored onto a display that no longer exists is invisible and unrecoverable without editing config by hand. */
export function clampToVisibleDisplay(bounds: WindowBounds, workAreas: readonly WorkArea[]): WindowBounds {
  const { x, y, width, height } = bounds;
  if (x === null || y === null) {
    return bounds;
  }

  const isOnSomeDisplay = workAreas.some(
    (area) => x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y,
  );

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
