// Libs
import { existsSync } from 'node:fs';

// Utils
import { type EngineWindow, allDisplays, createWindow, displayMatching } from '../engine/windows';
import { PersistedFile, asBoolean, asNumber, isRecord } from '../data/persistence';
import { devIconPath, isDevelopment, preloadPath } from '../app/env';
import { guardChromeWebContents } from '../security/security';
import { groundColour, titleBarOverlayFor, windowButtonPositionFor } from './appearance';

// Types
import type { DensityId, HeaderLayoutId } from '../../shared/types';

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
// Far enough to see there are two, near enough that the new one is where the old one was.
const CASCADE_STEP = 28;

/** Every chrome window still open, newest last, so a new one can be placed against the last. */
const openWindows: EngineWindow[] = [];

export function createChromeWindow(density: DensityId, layout: HeaderLayoutId): EngineWindow {
  const boundsFile = new PersistedFile<WindowBounds>('window.json', () => ({ ...DEFAULT_BOUNDS }), reviveBounds, {
    flushDelayMs: 600,
  });
  const workAreas = allDisplays().map((display) => display.workArea);
  const saved = clampToVisibleDisplay(boundsFile.get(), workAreas);
  // A second window opens down and to the right of the last, rather than exactly on top of it.
  const previous = openWindows.at(-1);
  const placed =
    previous && !previous.isDestroyed() && !previous.isMaximized()
      ? {
          ...saved,
          ...cascadedPosition(previous.getBounds(), saved, displayMatching(previous.getBounds()).workArea),
        }
      : saved;

  const window = createWindow({
    width: placed.width,
    height: placed.height,
    ...(placed.x !== null && placed.y !== null ? { x: placed.x, y: placed.y } : {}),
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
    trafficLightPosition: process.platform === 'darwin' ? windowButtonPositionFor(density, layout) : undefined,
    ...(process.platform !== 'darwin' ? { titleBarOverlay: titleBarOverlayFor(density, layout) } : {}),
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
  openWindows.push(window);
  window.on('closed', () => openWindows.splice(openWindows.indexOf(window), 1));

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

/** One step down and right of the window before, starting again at the corner when that would leave the screen. */
export function cascadedPosition(
  previous: { x: number; y: number },
  size: { width: number; height: number },
  workArea: WorkArea,
): { x: number; y: number } {
  const x = previous.x + CASCADE_STEP;
  const y = previous.y + CASCADE_STEP;
  const fits = x + size.width <= workArea.x + workArea.width && y + size.height <= workArea.y + workArea.height;
  return fits ? { x, y } : { x: workArea.x + CASCADE_STEP, y: workArea.y + CASCADE_STEP };
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
