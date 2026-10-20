// Utils
import { t } from '../i18n/translate';
import { canReadEverySite } from './extensions';

// Types
import type { MessageKey } from '../i18n/translate';

/** The manifest permissions worth a sentence, as Chrome's own warnings word them. */
const SENTENCES: Partial<Record<string, MessageKey>> = {
  history: 'main.extensions.abilities.changeHistory',
  tabs: 'main.extensions.abilities.history',
  webNavigation: 'main.extensions.abilities.history',
  bookmarks: 'main.extensions.abilities.bookmarks',
  downloads: 'main.extensions.abilities.downloads',
  notifications: 'main.extensions.abilities.notifications',
  clipboardRead: 'main.extensions.abilities.clipboardRead',
  clipboardWrite: 'main.extensions.abilities.clipboardWrite',
  cookies: 'main.extensions.abilities.cookies',
  management: 'main.extensions.abilities.management',
  nativeMessaging: 'main.extensions.abilities.nativeMessaging',
  debugger: 'main.extensions.abilities.debugger',
  declarativeNetRequest: 'main.extensions.abilities.blockContent',
  privacy: 'main.extensions.abilities.privacy',
  proxy: 'main.extensions.abilities.proxy',
  geolocation: 'main.extensions.abilities.geolocation',
};

const SITES_NAMED = 3;

/** What an extension could do, one sentence each, broadest first; an empty list when it asks for nothing that matters. */
export function abilitiesOf(permissions: readonly string[], hostPermissions: readonly string[]): string[] {
  const sites = [...new Set(hostPermissions.map(siteOfPattern).filter((site) => site !== null))];
  const siteSentence = canReadEverySite([], hostPermissions)
    ? t('main.extensions.abilities.everySite')
    : sites.length > 0
      ? t('main.extensions.abilities.someSites', {
          sites:
            sites.length > SITES_NAMED
              ? t('main.extensions.abilities.moreSites', {
                  sites: sites.slice(0, SITES_NAMED).join(', '),
                  count: sites.length - SITES_NAMED,
                })
              : sites.join(', '),
        })
      : null;
  const named = permissions.map((permission) => SENTENCES[permission]).filter((key) => key !== undefined);
  return [...(siteSentence ? [siteSentence] : []), ...new Set(named.map((key) => t(key)))];
}

/** The host a match pattern names, for saying it in a sentence; null for one that names every site. */
function siteOfPattern(pattern: string): string | null {
  const host = /^[^:]+:\/\/([^/]+)\//.exec(pattern)?.[1];
  if (!host || host === '*') {
    return null;
  }
  return host.replace(/^\*\./, '');
}
