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
  readingList: {
    isSaved: async () => false,
    add: vi.fn(async () => 'saved-id'),
    article: async () => saved,
    setRead: vi.fn(),
  },
};
let saved: { url: string; article: unknown } | null = null;
let readingItemId: string | null = null;
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
    select({ activeTabId: 'tab', readingItemId, setSurface, settings: DEFAULT_SETTINGS_SHAPE }),
}));

const { ReaderSurface } = await import('@/components/views/reader/ReaderSurface');

beforeEach(() => {
  html = story(false);
  images = {};
  saved = null;
  readingItemId = null;
  api.readingList.add.mockClear();
  updateSettings.mockClear();
  setSurface.mockClear();
});
afterEach(cleanup);

describe('the reading list from reader view', () => {
  it('saves the article as it is drawn, with the address it came from', async () => {
    render(<ReaderSurface />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save for later' }));
    expect(api.readingList.add).toHaveBeenCalledWith(
      'https://news.example/walk',
      expect.objectContaining({ title: 'A long walk' }),
    );
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeTruthy();
  });

  // Read from what was kept, so it works with the page gone and no connection.
  it('reads a saved article without asking the page for anything, and marks it read', async () => {
    readingItemId = 'saved-id';
    saved = {
      url: 'https://news.example/kept',
      article: {
        title: 'Kept for later',
        language: null,
        byline: null,
        siteName: null,
        minutes: 2,
        body: [{ kind: 'element', tag: 'p', href: null, children: [{ kind: 'text', text: 'Offline text' }] }],
      },
    };
    const readerDocument = vi.spyOn(api.tabs, 'readerDocument');
    render(<ReaderSurface />);
    expect(await screen.findByText('Offline text')).toBeTruthy();
    expect(readerDocument).not.toHaveBeenCalled();
    expect(api.readingList.setRead).toHaveBeenCalledWith('saved-id', true);
    readerDocument.mockRestore();
  });
});

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
