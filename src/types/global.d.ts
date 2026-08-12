import type { CopaceticApi } from '../../electron/shared/api';

declare global {
  interface Window {
    // Injected by the preload bridge.
    copacetic?: CopaceticApi;
  }
}

export {};
