import type { BrowserState } from './types';

/** Only the parts of the state that changed since the last push. */
export type BrowserStatePatch = Partial<BrowserState>;

/**
 * Which top-level parts of the state differ from what the chrome already has.
 *
 * Every event used to send everything: each tab, each download, and the whole
 * settings record with every per-site decision in it, so a favicon arriving
 * re-sent the zoom level of every site ever zoomed. The renderer then spent its
 * time working out that nothing it showed had changed. Comparing here, once,
 * means a download's progress sends the downloads and nothing else.
 */
export function changedSlices(
  previous: ReadonlyMap<keyof BrowserState, string>,
  state: BrowserState,
): { patch: BrowserStatePatch; sent: Map<keyof BrowserState, string> } {
  const sent = new Map(previous);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(state) as (keyof BrowserState)[]) {
    const serialised = JSON.stringify(state[key]);
    if (previous.get(key) !== serialised) {
      patch[key] = state[key];
      sent.set(key, serialised);
    }
  }
  return { patch: patch as BrowserStatePatch, sent };
}
