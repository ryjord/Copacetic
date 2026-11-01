// Libs
import type { BrowserWindow, Session, WebContents } from 'electron';

// Types
import type { EngineWindow } from './windows';
import type { EnginePage } from './views';
import type { EngineSession } from './sessions';

// Only the engine layer hands Electron its own objects back; outside it, lint refuses this import.

/** The Electron window behind an engine window: every one the engine hands out is a BrowserWindow. */
export function electronWindowOf(window: EngineWindow): BrowserWindow {
  // Narrowing back to the object createWindow made; a port replaces this file, not its callers.
  return window as BrowserWindow;
}

/** The Electron page behind an engine page: every one the engine hands out is a WebContents. */
export function electronPageOf(page: EnginePage): WebContents {
  // Narrowing back to the object the engine made; a port replaces this file, not its callers.
  return page as WebContents;
}

/** The Electron session behind an engine session: every one the engine hands out is a Session. */
export function electronSessionOf(session: EngineSession): Session {
  // Narrowing back to the object sessionFor made; a port replaces this file, not its callers.
  return session as Session;
}
