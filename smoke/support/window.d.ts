import type { CopaceticApi } from '../../electron/shared/api';

// The bridge the preload installs. Declared once so every smoke spec reaches it
// with the real type rather than a hand-written copy that can drift from it.
declare global {
  interface Window {
    copacetic: CopaceticApi;
  }
}

export {};
