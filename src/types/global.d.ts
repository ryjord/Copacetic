import type { CopaceticApi } from '../../electron/shared/api';

declare global {
  interface Window {
    /**
     * Injected by the preload bridge. Absent when the chrome is opened in a
     * plain browser tab during development, which `getBridge()` accounts for.
     */
    copacetic?: CopaceticApi;
  }
}

export {};
