import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { DownloadState } from '@shared/types';

const sent: unknown[][] = [];
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => unknown) =>
    call({
      downloads: {
        discard: (id: string) => sent.push(['discard', id]),
        removeMany: (ids: string[]) => sent.push(['removeMany', ids]),
        clearCompleted: () => sent.push(['clearCompleted']),
        openFolder: () => sent.push(['openFolder']),
      },
    }),
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

let downloads: DownloadState[] = [];
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (selector: (state: unknown) => unknown) =>
    selector({ downloads, closeSurface: () => {}, activeSurface: 'downloads' }),
}));

const { DownloadsSurface } = await import('@/components/views/downloads/DownloadsSurface');

afterEach(() => {
  cleanup();
  sent.length = 0;
});

const download = (overrides: Partial<DownloadState> = {}): DownloadState => ({
  id: 'one',
  filename: 'installer.dmg',
  savePath: '/tmp/installer.dmg',
  url: 'https://example.com/installer.dmg',
  receivedBytes: 100,
  totalBytes: 100,
  bytesPerSecond: null,
  status: 'completed',
  startedAt: 1,
  completedAt: 2,
  fileExists: true,
  urlChain: ['https://example.com/installer.dmg'],
  sha256: null,
  ...overrides,
});

/**
 * The logic for these was tested on its own; this is the half that says the
 * list actually shows it. A provenance nobody can see is a provenance that does
 * not exist.
 */
describe('what a download tells you about itself', () => {
  it('says nothing about a route when the file came straight from where you asked', () => {
    downloads = [download()];
    render(<DownloadsSurface />);
    expect(document.body.textContent).not.toContain('came from');
  });

  it('names both ends when the file came from somewhere else', () => {
    downloads = [download({ urlChain: ['https://get.example.com/x', 'https://cdn.other.test/file'] })];
    render(<DownloadsSurface />);
    expect(document.body.textContent).toContain('You asked get.example.com and the file came from cdn.other.test');
  });

  // A routine redirect is a detail; it is there when asked for and quiet until then.
  it('reads as routine when the redirect stayed on one site', () => {
    downloads = [download({ urlChain: ['https://www.example.com/a', 'https://dl.example.com/b'] })];
    render(<DownloadsSurface />);
    expect(document.body.textContent).not.toContain('Redirected within');
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(document.body.textContent).toContain('Redirected within example.com');
  });

  it('shows the hash of what actually arrived', () => {
    downloads = [download({ sha256: 'abc123def456' })];
    render(<DownloadsSurface />);
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(document.body.textContent).toContain('abc123def456');
  });

  it('offers no details before a hash has been computed', () => {
    downloads = [download({ sha256: null })];
    render(<DownloadsSurface />);
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull();
  });

  // A finished download is the ordinary case and says nothing; one whose file has gone says so.
  it('marks a file that is no longer where it was saved', () => {
    downloads = [download({ fileExists: false })];
    render(<DownloadsSurface />);
    expect(screen.getByText('Missing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show in folder' })).toBeNull();
  });
});

describe('narrowing and acting on the list', () => {
  const several = () => [
    download({ id: 'a', filename: 'zebra.pdf', totalBytes: 10, receivedBytes: 10, startedAt: 3 }),
    download({ id: 'b', filename: 'apple.zip', totalBytes: 900, receivedBytes: 900, startedAt: 2 }),
    download({ id: 'c', filename: 'broken.iso', status: 'interrupted', startedAt: 1 }),
  ];

  it('shows only the failed ones when asked', () => {
    downloads = several();
    render(<DownloadsSurface />);
    fireEvent.click(screen.getByRole('radio', { name: 'Failed' }));
    expect(screen.queryByText('zebra.pdf')).toBeNull();
    expect(screen.getByText('broken.iso')).toBeTruthy();
  });

  it('finds a download by the site it came from', () => {
    downloads = [
      download(),
      download({ id: 'two', filename: 'notes.txt', url: 'https://files.other.org/notes.txt' }),
    ];
    render(<DownloadsSurface />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by name or site' }), {
      target: { value: 'other.org' },
    });
    expect(screen.queryByText('installer.dmg')).toBeNull();
    expect(screen.getByText('notes.txt')).toBeTruthy();
  });

  it('says how many it will clear', () => {
    downloads = several();
    render(<DownloadsSurface />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear 3 finished' }));
    expect(sent).toEqual([['clearCompleted']]);
  });

  it('removes a selection from the list at once', () => {
    downloads = several();
    render(<DownloadsSurface />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select zebra.pdf' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select apple.zip' }));
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Remove from list' }));
    expect(sent).toEqual([['removeMany', ['a', 'b']]]);
  });

  // A program waiting on the person, said in a sentence, and thrown away only once confirmed.
  it('explains a held file and confirms before deleting it', async () => {
    downloads = [download({ status: 'progressing', isHeld: true, completedAt: null })];
    render(<DownloadsSurface />);
    expect(screen.getByText(/is a program or installer, so it is held/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    expect(sent).toEqual([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete it' }));
    expect(sent).toEqual([['discard', 'one']]);
  });
});
