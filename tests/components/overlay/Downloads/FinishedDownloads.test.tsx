import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DownloadState } from '@shared/types';

const calls: string[] = [];
let openProblem = '';
const api = {
  downloads: {
    openFile: async (id: string) => {
      calls.push(`open ${id}`);
      return openProblem;
    },
    revealFile: (id: string) => calls.push(`reveal ${id}`),
    retry: (id: string) => calls.push(`retry ${id}`),
  },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => void) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
}));

let downloads: DownloadState[] = [];
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { downloads: DownloadState[] }) => unknown) => select({ downloads }),
}));

const { FinishedDownloads } = await import('@/components/overlay/Downloads/FinishedDownloads');

const download = (id: string, over: Partial<DownloadState>): DownloadState => ({
  id,
  filename: `${id}.pdf`,
  savePath: `/tmp/${id}.pdf`,
  url: 'https://example.com/file.pdf',
  receivedBytes: 2048,
  totalBytes: 2048,
  bytesPerSecond: null,
  status: 'completed',
  startedAt: 0,
  completedAt: null,
  fileExists: true,
  urlChain: [],
  sha256: null,
  isHush: false,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  calls.length = 0;
});

describe('a download that just finished', () => {
  it('appears when it finishes, not for one that finished before', () => {
    vi.useFakeTimers({ now: 10_000 });
    downloads = [download('old', { completedAt: 5_000 }), download('new', { completedAt: 11_000 })];
    render(<FinishedDownloads />);
    expect(screen.queryByText('old.pdf')).toBeNull();
    expect(screen.getByText('new.pdf')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show in folder' }));
    expect(calls).toEqual(['open new', 'reveal new']);
  });

  it('offers to try again when it failed, and goes on its own', () => {
    vi.useFakeTimers({ now: 10_000 });
    downloads = [download('broken', { status: 'interrupted', completedAt: 12_000 })];
    render(<FinishedDownloads />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(calls).toEqual(['retry broken']);

    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    expect(screen.queryByText('broken.pdf')).toBeNull();
  });
});

describe('a file that would not open', () => {
  // Said on the card whose button was pressed, rather than nowhere.
  it('says why', async () => {
    vi.useFakeTimers({ now: 10_000, shouldAdvanceTime: true });
    openProblem = 'The file is no longer where it was saved.';
    downloads = [download('gone', { completedAt: 11_000 })];
    render(<FinishedDownloads />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('The file is no longer where it was saved.')).toBeTruthy();
    openProblem = '';
  });
});
