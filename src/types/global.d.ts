import type { CopaceticApi } from '@shared/ipc/api';

declare global {
  interface Window {
    // Injected by the preload bridge.
    copacetic?: CopaceticApi;
  }
}

export {};
