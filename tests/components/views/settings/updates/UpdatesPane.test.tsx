import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
import type { UpdateState } from '@shared/types';

const sent: string[] = [];
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => void) =>
    call({
      updates: {
        downloadInstaller: () => sent.push('downloadInstaller'),
        openReleases: () => sent.push('openReleases'),
      },
    }),
  ask: async () => undefined,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));

const BASE: UpdateState = {
  status: { state: 'current' },
  delivery: 'manual',
  manualReason: null,
  lastCheckedAt: null,
  releasesUrl: 'https://github.com/ryjord/Copacetic/releases/latest',
  releaseNotes: null,
  currentVersion: '2.0.0',
  includesBetas: false,
  canOpenInstaller: false,
};
let update: UpdateState = BASE;
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown; update: UpdateState }) => unknown) =>
    select({ settings: DEFAULT_SETTINGS_SHAPE, update }),
}));

const { UpdatesPane } = await import('@/components/views/settings/updates/UpdatesPane');

afterEach(() => {
  cleanup();
  sent.length = 0;
  update = BASE;
});

describe('the updates pane', () => {
  it('names the version this is', () => {
    render(<UpdatesPane />);
    expect(screen.getByText('Copacetic 2.0.0')).toBeTruthy();
  });

  it('shows what the new version changes', () => {
    update = { ...BASE, status: { state: 'available', version: '2.1.0' }, releaseNotes: '· Split view.' };
    render(<UpdatesPane />);
    expect(screen.getByText('What 2.1.0 changes')).toBeTruthy();
    expect(screen.getByText('· Split view.')).toBeTruthy();
  });

  // Not signed by Apple, and the pane says so rather than letting macOS be the first to mention it.
  it('fetches and opens the installer on macOS, saying it is not signed', () => {
    update = { ...BASE, status: { state: 'available', version: '2.1.0' }, canOpenInstaller: true };
    render(<UpdatesPane />);
    expect(screen.getByText(/not signed by Apple/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download and open' }));
    expect(sent).toEqual(['downloadInstaller']);
  });

  it('chooses betas on a finished build', () => {
    render(<UpdatesPane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Releases and betas' }));
    expect(updateSettings).toHaveBeenCalledWith({ updateChannel: 'betas' });
  });

  it('offers no choice on a beta, which is offered betas anyway', () => {
    update = { ...BASE, currentVersion: '2.0.0-beta.3' };
    render(<UpdatesPane />);
    expect(screen.queryByRole('radio', { name: 'Releases' })).toBeNull();
    expect(screen.getByText(/This is a beta/)).toBeTruthy();
  });
});
