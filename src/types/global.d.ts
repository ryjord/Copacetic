import type { CopaceticApi } from '@shared/api';

declare global {
  interface Window {
    // Injected by the preload bridge.
    copacetic?: CopaceticApi;
  }
}

export {};
