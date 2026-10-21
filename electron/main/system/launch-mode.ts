import { app, type BrowserWindow, type WebContents } from 'electron';
import type { CommandLine } from './command-line';

/**
 * Started by the test suites without taking the screen.
 *
 * Set only by the smoke harness and the packaging check, which launch the app
 * dozens of times while someone is working in something else; an app that
 * activates on every launch takes their keyboard each time. Nothing a person
 * runs sets it.
 */
export function isLaunchedInBackground(): boolean {
  return process.env.COPACETIC_LAUNCH_IN_BACKGROUND === '1';
}

// Chromium slows a window it takes to be hidden, and an unseen window is one; a test would then wait on it.
const UNTHROTTLED_SWITCHES = [
  'disable-backgrounding-occluded-windows',
  'disable-renderer-backgrounding',
  'disable-background-timer-throttling',
];

/** Before the app is ready, so a window nobody can see still runs as one in front would. */
export function applyLaunchSwitches(commandLine: CommandLine): void {
  if (isLaunchedInBackground()) {
    UNTHROTTLED_SWITCHES.forEach((name) => commandLine.appendSwitch(name));
  }
}

/**
 * No Dock icon and no activation on macOS, so launching does not change which
 * app is in front, and every window unseen and passing clicks through, so none
 * is drawn over what the person is working in. Its position is left alone, as
 * the window tests read it back.
 */
export function applyLaunchMode(): void {
  if (!isLaunchedInBackground()) {
    return;
  }
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
  }
  app.on('browser-window-created', (_event, window) => {
    window.setOpacity(0);
    window.setIgnoreMouseEvents(true);
  });
}

/**
 * Gives a page or the chrome the keyboard.
 *
 * On macOS this also brings the whole app to the front, because Electron
 * focuses the window that holds the contents. A background launch skips it:
 * nothing there can see which part holds the keyboard, and asking would take
 * it from whatever the person is using.
 */
export function focusContents(contents: WebContents): void {
  if (isLaunchedInBackground() || contents.isDestroyed()) {
    return;
  }
  contents.focus();
}

export function showWindow(window: BrowserWindow): void {
  if (isLaunchedInBackground()) {
    window.showInactive();
    return;
  }
  window.show();
}
