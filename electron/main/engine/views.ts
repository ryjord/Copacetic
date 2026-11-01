// Libs
import {
  type AuthInfo,
  type AuthenticationResponseDetails,
  type ContextMenuParams,
  type Event,
  type HandlerDetails,
  type InputEvent,
  type NavigationEntry,
  type NavigationHistory,
  type View,
  type WebContents,
  WebContentsView,
  type WebFrameMain,
  type WebPreferences,
} from 'electron';

// Utils
import { electronPageOf, electronSessionOf } from './native';

// Types
import type { EngineDebugger } from './devtools';
import type { EngineSession } from './sessions';
import type { WindowOptions } from './windows';

export type EngineEvent<Params extends object = object> = Event<Params>;
export type EngineInputEvent = InputEvent;
export type PageContextMenu = ContextMenuParams;
export type NavigationRecord = NavigationEntry;

export type EngineFrame = Pick<WebFrameMain, 'url'>;

export type EngineNavigationHistory = Pick<
  NavigationHistory,
  | 'canGoBack'
  | 'canGoForward'
  | 'getActiveIndex'
  | 'getAllEntries'
  | 'goBack'
  | 'goForward'
  | 'goToIndex'
  | 'removeEntryAtIndex'
  | 'restore'
>;

export type WindowOpenRequest = HandlerDetails;

/** What to do with a page's request for a new window: refuse it, or let the engine make the page and take it. */
export interface WindowOpenVerdict {
  action: 'allow' | 'deny';
  outlivesOpener?: boolean;
  createWindow?: (options: WindowOptions) => EnginePage;
}

type PageMember =
  | 'close'
  | 'closeDevTools'
  | 'copyImageAt'
  | 'downloadURL'
  | 'executeJavaScript'
  | 'executeJavaScriptInIsolatedWorld'
  | 'findInPage'
  | 'focus'
  | 'getOSProcessId'
  | 'getTitle'
  | 'getURL'
  | 'id'
  | 'insertCSS'
  | 'inspectElement'
  | 'ipc'
  | 'isCurrentlyAudible'
  | 'isDestroyed'
  | 'isDevToolsOpened'
  | 'isLoading'
  | 'loadURL'
  | 'off'
  | 'on'
  | 'once'
  | 'openDevTools'
  | 'print'
  | 'reload'
  | 'reloadIgnoringCache'
  | 'replaceMisspelling'
  | 'savePage'
  | 'send'
  | 'setAudioMuted'
  | 'setVisualZoomLevelLimits'
  | 'setWebRTCIPHandlingPolicy'
  | 'setZoomFactor'
  | 'stop'
  | 'stopFindInPage';

/** Everything Copacetic does with a loaded page, a tab's or the chrome's; a port of the engine implements this and no more. */
export interface EnginePage extends Pick<WebContents, PageMember> {
  readonly debugger: EngineDebugger;
  readonly mainFrame: EngineFrame;
  readonly navigationHistory: EngineNavigationHistory;
  readonly session: EngineSession;
  setWindowOpenHandler(handler: (request: WindowOpenRequest) => WindowOpenVerdict): void;
}

/** What a window's content view needs of any child it holds. */
export type EngineViewBase = Pick<View, 'setBackgroundColor' | 'setBorderRadius' | 'setBounds' | 'setVisible'>;

/** A view showing one page inside a window. */
export interface EngineView extends EngineViewBase {
  readonly webContents: EnginePage;
}

export interface ViewOptions {
  /** A page that already exists, such as one a site opened, to show rather than a new one. */
  adopting?: EnginePage;
  /** The session to load in, when it is not named by `preferences.partition`. */
  session?: EngineSession;
  preferences: Omit<WebPreferences, 'session'>;
}

export function createView(options: ViewOptions): EngineView {
  return new WebContentsView({
    ...(options.adopting ? { webContents: electronPageOf(options.adopting) } : {}),
    webPreferences: {
      ...options.preferences,
      ...(options.session ? { session: electronSessionOf(options.session) } : {}),
    },
  });
}

export type LoginRequest = AuthInfo;
export type LoginResponseDetails = AuthenticationResponseDetails;
