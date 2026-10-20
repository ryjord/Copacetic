import { t } from '../i18n/translate';

/** One tab of a saved session: where it was, and what it was called then. */
export interface NamedSessionTab {
  url: string;
  title: string;
}

/** A saved session as a list shows it, without its tabs. */
export interface NamedSessionSummary {
  id: string;
  name: string;
  savedAt: number;
  tabCount: number;
}

export const MAX_SESSION_NAME = 60;
export const MAX_SESSION_TABS = 500;
export const MAX_NAMED_SESSIONS = 100;

/** Named after the tab that leads it, which is the one most people would recognise it by. */
export function defaultSessionName(tabs: readonly NamedSessionTab[]): string {
  const [first] = tabs;
  const lead = (first?.title || first?.url || t('main.sessions.untitled')).slice(0, MAX_SESSION_NAME);
  return tabs.length > 1 ? t('main.sessions.andMore', { lead, count: tabs.length - 1 }) : lead;
}
