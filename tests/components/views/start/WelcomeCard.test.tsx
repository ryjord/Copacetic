// Libs
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { WelcomeCard } from '@/components/views/start/WelcomeCard';

let status = 'can-ask';
const send = vi.fn();
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: unknown) => send(call),
  ask: async () => status,
  getBridge: () => null,
}));

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));

beforeEach(() => {
  status = 'can-ask';
  send.mockClear();
  updateSettings.mockClear();
});
afterEach(cleanup);

describe("a new profile's first start page", () => {
  it('offers the three things worth doing first, each one press', async () => {
    render(<WelcomeCard />);
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Make default' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open a Hush tab' })).toBeTruthy();
  });

  // Asking to be made default when it already is would be asking for nothing.
  it('leaves out the default browser once Copacetic is it', async () => {
    status = 'default';
    render(<WelcomeCard />);
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'Make default' })).toBeNull();
  });

  it('is put away for good when done, as a setting rather than a tab remembering it', () => {
    render(<WelcomeCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(updateSettings).toHaveBeenCalledWith({ welcomeDismissed: true });
  });
});
