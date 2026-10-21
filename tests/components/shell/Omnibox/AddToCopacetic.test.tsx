// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { AddToCopacetic } from '@/components/shell/Omnibox/AddToCopacetic';

// Types
import type { TabState } from '../../../../electron/shared/types';

const ID = 'ddkjiahejlhfcafbddmgiahcphecmpfh';
const STORE_PAGE = `https://chromewebstore.google.com/detail/ublock-origin-lite/${ID}`;
const installed: { id: string }[] = [];
const addFromWebStore = vi.fn(async (_id: string) => '');

vi.mock('@/lib/bridge/bridge', () => ({
  ask: (action: (api: unknown) => Promise<unknown>) =>
    action({ extensions: { list: async () => installed, addFromWebStore } }),
  getBridge: () => null,
}));

afterEach(() => {
  cleanup();
  installed.length = 0;
  vi.clearAllMocks();
});

// Only the address and Hush decide anything here.
const tab = (url: string, isHush = false) => ({ id: 'a', url, isHush }) as TabState;

describe('Add to Copacetic', () => {
  it('is offered on an extension’s store page, and adds that extension', async () => {
    render(<AddToCopacetic tab={tab(STORE_PAGE)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Copacetic' }));
    expect(addFromWebStore).toHaveBeenCalledWith(ID);
  });

  it('is not offered anywhere else in the store, or in Hush', () => {
    render(<AddToCopacetic tab={tab('https://chromewebstore.google.com/category/extensions')} />);
    render(<AddToCopacetic tab={tab(STORE_PAGE, true)} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says when the extension is already in', async () => {
    installed.push({ id: ID });
    render(<AddToCopacetic tab={tab(STORE_PAGE)} />);
    expect(await screen.findByText('In Copacetic')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says why an extension could not be added, and offers it again', async () => {
    addFromWebStore.mockResolvedValueOnce('The store sent nothing back.');
    render(<AddToCopacetic tab={tab(STORE_PAGE)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Copacetic' }));
    expect((await screen.findByRole('status')).textContent).toContain('The store sent nothing back.');
    expect(screen.getByRole('button', { name: 'Could not add, try again' })).toBeTruthy();
  });
});
