// Libs
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Display,
  type Rectangle,
  type View,
  screen,
} from 'electron';

// Types
import type { EnginePage, EngineViewBase } from './views';

export type WindowOptions = BrowserWindowConstructorOptions;
export type EngineRectangle = Rectangle;
export type EngineDisplay = Pick<Display, 'workArea'>;

/** What Copacetic does with the view that fills a window: the chrome, tabs and overlays are its children. */
export interface EngineContentView extends Pick<
  View,
  'setBackgroundColor' | 'setBorderRadius' | 'setBounds' | 'setVisible'
> {
  addChildView(view: EngineViewBase, index?: number): void;
  removeChildView(view: EngineViewBase): void;
}

type WindowMember =
  | 'close'
  | 'destroy'
  | 'focus'
  | 'getBounds'
  | 'getContentSize'
  | 'getNormalBounds'
  | 'getPosition'
  | 'getSize'
  | 'id'
  | 'isDestroyed'
  | 'isFocused'
  | 'isFullScreen'
  | 'isMaximized'
  | 'isMinimized'
  | 'loadURL'
  | 'maximize'
  | 'off'
  | 'on'
  | 'once'
  | 'restore'
  | 'setBackgroundColor'
  | 'setFullScreen'
  | 'setIgnoreMouseEvents'
  | 'setOpacity'
  | 'setTitleBarOverlay'
  | 'setWindowButtonPosition'
  | 'show'
  | 'showInactive';

/** Everything Copacetic does with a top-level window; a port of the engine implements this and no more. */
export interface EngineWindow extends Pick<BrowserWindow, WindowMember> {
  readonly webContents: EnginePage;
  readonly contentView: EngineContentView;
}

export function createWindow(options: WindowOptions): EngineWindow {
  return new BrowserWindow(options);
}

export function focusedWindow(): EngineWindow | null {
  return BrowserWindow.getFocusedWindow();
}

export function allDisplays(): EngineDisplay[] {
  return screen.getAllDisplays();
}

export function displayMatching(bounds: EngineRectangle): EngineDisplay {
  return screen.getDisplayMatching(bounds);
}
