import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { TabState } from '@shared/types';

// Each page stands in as its name and what it was handed, so this tests the choice and not the pages.
const page = (name: string) =>
  function StandIn(props: Record<string, unknown>) {
    return <p>{`${name} ${JSON.stringify(props)}`}</p>;
  };
vi.mock('@/components/views/start/StartPage', () => ({ StartPage: page('start') }));
vi.mock('@/components/views/settings/SettingsPage', () => ({ SettingsPage: page('settings') }));
vi.mock('@/components/views/history/HistoryPage', () => ({ HistoryPage: page('history') }));
vi.mock('@/components/views/bookmarks/BookmarksPage', () => ({ BookmarksPage: page('bookmarks') }));
vi.mock('@/components/views/downloads/DownloadsPage', () => ({ DownloadsPage: page('downloads') }));

const { InternalPage } = await import('@/components/shell/InternalPage/InternalPage');

afterEach(cleanup);

const tab = (url: string, internalPage: TabState['internalPage']): TabState =>
  ({ id: 'tab-1', url, internalPage, isHush: false }) as TabState;

describe('what a tab of ours shows', () => {
  it.each([
    ['copacetic://start', 'start', 'start {"tabId":"tab-1","isHush":false}'],
    ['copacetic://settings/sites', 'settings', 'settings {"tabId":"tab-1","section":"sites"}'],
    ['copacetic://settings', 'settings', 'settings {"tabId":"tab-1","section":null}'],
    ['copacetic://history', 'history', 'history {"tabId":"tab-1"}'],
    ['copacetic://bookmarks', 'bookmarks', 'bookmarks {"tabId":"tab-1"}'],
    ['copacetic://downloads', 'downloads', 'downloads {}'],
  ] as const)('draws the right page for %s', (url, internalPage, expected) => {
    render(<InternalPage tab={tab(url, internalPage)} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('draws nothing for a site', () => {
    const { container } = render(<InternalPage tab={tab('https://example.com/', null)} />);
    expect(container.textContent).toBe('');
  });
});
