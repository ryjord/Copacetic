// Utils
import { INTERNAL_SCHEME, START_PAGE_URL, isInternalUrl } from '../browsing/url';
import { t } from '../i18n/translate';

/** The pages Copacetic draws itself in a tab, with no website behind them. */
export const INTERNAL_PAGES = ['start', 'settings', 'history', 'bookmarks', 'downloads'] as const;

export type InternalPage = (typeof INTERNAL_PAGES)[number];

/** Where in a page to land, such as a settings pane: lowercase letters only, so it can never become a path. */
const SECTION = /^[a-z]{1,30}$/;
const PREFIX = `${INTERNAL_SCHEME}://`;

export interface InternalAddress {
  page: InternalPage;
  section: string | null;
}

export function isInternalPage(value: unknown): value is InternalPage {
  return INTERNAL_PAGES.some((page) => page === value);
}

export function isSection(value: unknown): value is string {
  return typeof value === 'string' && SECTION.test(value);
}

/** The address of an internal page, such as copacetic://settings/sites. */
export function internalPageUrl(page: InternalPage, section: string | null = null): string {
  if (page === 'start') {
    return START_PAGE_URL;
  }
  return section !== null && isSection(section) ? `${PREFIX}${page}/${section}` : `${PREFIX}${page}`;
}

/** Which internal page an address is, and where in it; null for anything else, including an unknown page. */
export function internalAddressOf(url: string): InternalAddress | null {
  if (!isInternalUrl(url)) {
    return null;
  }
  const [host = '', section = ''] = url.slice(PREFIX.length).split(/[?#]/)[0]?.split('/') ?? [];
  if (!isInternalPage(host)) {
    return null;
  }
  return { page: host, section: isSection(section) ? section : null };
}

export function internalPageOf(url: string): InternalPage | null {
  return internalAddressOf(url)?.page ?? null;
}

/** What the tab is called while it shows an internal page. */
export function internalPageTitle(page: InternalPage): string {
  switch (page) {
    case 'start':
      return t('main.tabs.newTabTitle');
    case 'settings':
      return t('settings.surface.title');
    case 'history':
      return t('views.history.title');
    case 'bookmarks':
      return t('views.bookmarks.title');
    case 'downloads':
      return t('views.downloads.title');
  }
}
