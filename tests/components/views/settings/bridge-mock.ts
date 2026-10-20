import { vi } from 'vitest';

/** Every bridge call answers with its fallback, so a pane renders as it would before anything arrives. */
export const fallbackBridge = {
  send: vi.fn(),
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
};
