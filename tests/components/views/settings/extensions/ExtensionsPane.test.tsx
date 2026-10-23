// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { ExtensionsPane } from '@/components/views/settings/extensions/ExtensionsPane';

const create = vi.fn();
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => void) => call({ tabs: { create } }),
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the Extensions pane', () => {
  // A beta's first extension should not start with someone looking up where the store is.
  it('opens the Chrome Web Store in a tab, from where an extension is added', () => {
    render(<ExtensionsPane />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the store' }));
    expect(create).toHaveBeenCalledWith('https://chromewebstore.google.com/category/extensions');
  });
});
