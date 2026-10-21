// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { SavePasswordCard } from '@/components/overlay/SavePassword/SavePasswordCard';

const answerSaveOffer = vi.fn();

vi.mock('@/lib/bridge/bridge', () => ({
  send: (action: (api: unknown) => unknown) => action({ vault: { answerSaveOffer } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const offer = {
  id: 'offer-1',
  tabId: 'tab-1',
  site: 'example.com',
  username: 'riley@example.com',
  kind: 'save',
} as const;

describe('the offer to save a password', () => {
  it('names the site and username, and answers with the choice made', () => {
    render(<SavePasswordCard offer={offer} />);
    expect(screen.getByText('Save the password for example.com?')).toBeTruthy();
    expect(screen.getByText('riley@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Never for this site' }));
    expect(answerSaveOffer).toHaveBeenCalledWith('offer-1', 'never');
  });

  it('offers an update for a password that changed', () => {
    render(<SavePasswordCard offer={{ ...offer, kind: 'update', username: '' }} />);
    expect(screen.getByText('Update the saved password for example.com?')).toBeTruthy();
    expect(screen.getByText('No username')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(answerSaveOffer).toHaveBeenCalledWith('offer-1', 'save');
  });
});
