/** Whether the chrome is running on macOS, where shortcuts print as glyphs and the window has traffic lights. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.platform.toLowerCase().includes('mac');
}
