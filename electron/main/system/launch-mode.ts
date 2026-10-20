import { app, type BrowserWindow, type WebContents } from 'electron';

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

/** No Dock icon and no activation on macOS, so launching does not change which app is in front. */
export function applyLaunchMode(): void {
  if (isLaunchedInBackground() && process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
  }
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
