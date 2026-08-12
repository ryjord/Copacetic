import type { CopaceticApi } from '../../electron/shared/api';

/** Access to the preload bridge. */
export function getBridge(): CopaceticApi | null {
  if (typeof window === 'undefined') return null;
  return window.copacetic ?? null;
}

export function isRunningInShell(): boolean {
  return getBridge() !== null;
}

/** Fire-and-forget bridge call that stays quiet outside the shell. */
export function send(action: (api: CopaceticApi) => Promise<unknown> | void): void {
  const api = getBridge();
  if (!api) return;
  const result = action(api);
  if (result instanceof Promise) {
    result.catch((error: unknown) => {
      console.error('[copacetic] bridge call failed', error);
    });
  }
}

/** Bridge call whose result matters, with a value to fall back to. */
export async function ask<T>(action: (api: CopaceticApi) => Promise<T>, fallback: T): Promise<T> {
  const api = getBridge();
  if (!api) return fallback;
  try {
    return await action(api);
  } catch (error) {
    console.error('[copacetic] bridge query failed', error);
    return fallback;
  }
}
