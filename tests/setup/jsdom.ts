// jsdom lays nothing out, so it has no ResizeObserver; a component that measures itself gets one that never fires.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

export {};
