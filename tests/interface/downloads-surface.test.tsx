import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { DownloadState } from '@shared/types';

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

let downloads: DownloadState[] = [];
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (selector: (state: unknown) => unknown) =>
    selector({ downloads, closeSurface: () => {}, activeSurface: 'downloads' }),
}));

const { DownloadsSurface } = await import('@/views/DownloadsSurface/DownloadsSurface');

afterEach(cleanup);

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

  it('reads as routine when the redirect stayed on one site', () => {
    downloads = [download({ urlChain: ['https://www.example.com/a', 'https://dl.example.com/b'] })];
    render(<DownloadsSurface />);
    expect(document.body.textContent).toContain('Redirected within example.com');
  });

  it('shows the hash of what actually arrived', () => {
    downloads = [download({ sha256: 'abc123def456' })];
    render(<DownloadsSurface />);
    expect(document.body.textContent).toContain('abc123def456');
  });

  it('shows no hash line before one has been computed', () => {
    downloads = [download({ sha256: null })];
    render(<DownloadsSurface />);
    expect(document.body.textContent).not.toContain('sha256');
  });
});
