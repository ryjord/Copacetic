import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';

const sentence = 'The quick fox ran over the hill and kept going until the evening came down.';
const story = (withImage: boolean) => `<html><head><title>A long walk</title></head><body><article>
  <h1>A long walk</h1>
  <p>${sentence.repeat(6)}</p>
  ${withImage ? '<img src="https://news.example/hill.jpg" alt="The hill">' : ''}
  <p>${sentence.repeat(4)}</p>
</article></body></html>`;

let html = story(false);
let images: Record<string, string> = {};
const api = {
  tabs: {
    readerDocument: async () => ({ url: 'https://news.example/walk', html }),
    readerImages: async () => images,
    print: vi.fn(),
  },
  translation: { installedBytes: async () => 0 },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => null,
  isRunningInShell: () => false,
}));
const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));
const setSurface = vi.fn();
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: unknown) => unknown) =>
    select({ activeTabId: 'tab', setSurface, settings: DEFAULT_SETTINGS_SHAPE }),
}));

const { ReaderSurface } = await import('@/components/views/reader/ReaderSurface');

beforeEach(() => {
  html = story(false);
  images = {};
  updateSettings.mockClear();
  setSurface.mockClear();
});
afterEach(cleanup);

describe('reader view', () => {
  it('sets the text size, typeface and line length', async () => {
    render(<ReaderSurface />);
    fireEvent.click(await screen.findByRole('button', { name: 'Text' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Larger' }));
    expect(updateSettings).toHaveBeenCalledWith({
      readerStyle: { size: 'larger', typeface: 'serif', width: 'default' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Sans' }));
    expect(updateSettings).toHaveBeenLastCalledWith({
      readerStyle: { size: 'default', typeface: 'sans', width: 'default' },
    });
  });

  it('goes back to the page it came from', async () => {
    render(<ReaderSurface />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open original' }));
    expect(setSurface).toHaveBeenCalledWith('none');
  });

  // Said only when it is true: an article with no missing picture has nothing to explain.
  it('mentions blocked images only when one is missing', async () => {
    render(<ReaderSurface />);
    await screen.findAllByRole('heading', { name: 'A long walk' });
    expect(screen.queryByText(/Some images are missing/)).toBeNull();
    cleanup();

    html = story(true);
    render(<ReaderSurface />);
    expect(await screen.findByText(/Some images are missing/)).toBeTruthy();
  });
});
