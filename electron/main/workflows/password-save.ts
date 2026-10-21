// Libs
import { randomUUID } from 'node:crypto';

// Utils
import { entriesForPage, isFillablePage, siteOf } from '../../shared/passwords/credential-matching';
import { SIGN_IN_WATCH_SCRIPT } from '../system/sign-in-watch-script';
import { t } from '../../shared/i18n/translate';
import { isRecord } from '../data/persistence';

// Types
import type { PasswordOffer, PasswordOfferAnswer, Settings, TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { VaultSession } from '../vault/vault-session';
import type { TabManager } from '../tabs/tabs';

// A world of its own, apart from the page's (0) and the one Electron gives a preload (999).
const WATCH_WORLD = 1031;
// A navigation this long after the form was sent is not the sign-in finishing.
const OFFER_WITHIN_MS = 60_000;
// Longer than any username or password a site takes; anything longer is not one.
const MOST_FIELD_LENGTH = 4096;

/** How a tab's page changed: a new document, a move within the same one, or a document finished loading. */
export type PageChange = 'committed' | 'in-page' | 'loaded';

interface PasswordSaveDeps {
  tabs: TabManager;
  vaultSession: VaultSession;
  notices: NoticeCentre;
  settings: () => Settings;
  /** Adds a site to those never offered it, in every window. */
  neverOn: (site: string) => void;
  changed: () => void;
  now?: () => number;
}

interface Submitted {
  origin: string;
  username: string;
  password: string;
  at: number;
}

interface HeldOffer extends PasswordOffer {
  origin: string;
  password: string;
  /** The saved entry an update would change. */
  entryId: string | null;
}

function readSubmitted(value: unknown): { username: string; password: string } | null {
  if (!isRecord(value) || typeof value.username !== 'string' || typeof value.password !== 'string') {
    return null;
  }
  const username = value.username.trim();
  const { password } = value;
  if (username.length > MOST_FIELD_LENGTH || password.length > MOST_FIELD_LENGTH || (!username && !password)) {
    return null;
  }
  return { username, password };
}

/**
 * Offering to save a password you have just signed in with. The fields are read
 * in a world the page cannot reach, and the password stays in the main process:
 * the window is told only the site and the username. The offer comes once the
 * page moves on after the form was sent, so a sign-in that failed offers nothing.
 */
export class PasswordSave {
  private readonly submitted = new Map<TabId, Submitted>();
  // A sign-in that asks for the username on one page and the password on the next.
  private readonly usernames = new Map<TabId, Submitted>();
  // Each page's watch, so one left from a page that has gone is not mistaken for the one now there.
  private readonly watches = new Map<TabId, number>();
  private held: HeldOffer | null = null;

  constructor(private readonly deps: PasswordSaveDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  offer(): PasswordOffer | null {
    if (!this.held) {
      return null;
    }
    const { id, tabId, site, username, kind } = this.held;
    return { id, tabId, site, username, kind };
  }

  pageChanged(tabId: TabId, change: PageChange): void {
    if (change !== 'loaded') {
      this.offerFor(tabId);
    }
    if (change !== 'committed') {
      void this.watch(tabId);
    }
  }

  forget(tabId: TabId): void {
    this.submitted.delete(tabId);
    this.usernames.delete(tabId);
    this.watches.delete(tabId);
    if (this.held?.tabId === tabId) {
      this.held = null;
      this.deps.changed();
    }
  }

  answer(id: string, answer: PasswordOfferAnswer): void {
    const held = this.held;
    if (!held || held.id !== id) {
      return;
    }
    this.held = null;
    this.deps.changed();
    if (answer === 'never') {
      this.deps.neverOn(held.site);
      return;
    }
    if (answer === 'save') {
      this.keep(held);
    }
  }

  private keep(held: HeldOffer): void {
    const { vault } = this.deps.vaultSession;
    const result =
      held.entryId === null
        ? vault.add({ origin: held.origin, username: held.username, password: held.password })
        : vault.update(held.entryId, { password: held.password });
    const problem = result && 'error' in result ? result.error : '';
    this.deps.notices.notify({
      id: `save-password-${held.tabId}`,
      tone: problem ? 'info' : 'done',
      key: 'save-password',
      message: problem || t('main.passwords.save.saved', { site: held.site }),
    });
  }

  private isWatched(url: string): boolean {
    const settings = this.deps.settings();
    const site = siteOf(url);
    return (
      settings.offerToSavePasswords &&
      site !== null &&
      isFillablePage(url) &&
      !settings.neverSavePasswordsOn.includes(site) &&
      this.deps.vaultSession.facts().hasKeychain
    );
  }

  private async watch(tabId: TabId): Promise<void> {
    const contents = this.deps.tabs.contentsForTab(tabId);
    const url = contents?.getURL() ?? '';
    if (!contents || this.deps.tabs.isHush(tabId) || !this.isWatched(url)) {
      return;
    }
    const watch = (this.watches.get(tabId) ?? 0) + 1;
    this.watches.set(tabId, watch);
    let found: unknown;
    try {
      found = await contents.executeJavaScriptInIsolatedWorld(WATCH_WORLD, [{ code: SIGN_IN_WATCH_SCRIPT }]);
    } catch {
      return;
    }
    const submitted = readSubmitted(found);
    if (this.watches.get(tabId) !== watch || contents.isDestroyed() || !submitted) {
      return;
    }
    this.remember(tabId, url, submitted);
    // The same page can be sent again, after a mistyped password.
    void this.watch(tabId);
  }

  private remember(tabId: TabId, url: string, submitted: { username: string; password: string }): void {
    const origin = new URL(url).origin;
    const at = this.now();
    if (!submitted.password) {
      this.usernames.set(tabId, { origin, username: submitted.username, password: '', at });
      return;
    }
    const earlier = this.usernames.get(tabId);
    const isEarlierStep =
      earlier !== undefined && siteOf(earlier.origin) === siteOf(origin) && at - earlier.at < OFFER_WITHIN_MS;
    const username = submitted.username || (isEarlierStep ? earlier.username : '');
    this.submitted.set(tabId, { origin, username, password: submitted.password, at });
  }

  private offerFor(tabId: TabId): void {
    const submitted = this.submitted.get(tabId);
    if (!submitted) {
      return;
    }
    this.submitted.delete(tabId);
    const site = siteOf(submitted.origin);
    if (!site || this.now() - submitted.at > OFFER_WITHIN_MS) {
      return;
    }
    const saved = entriesForPage(submitted.origin, this.deps.vaultSession.vault.state().entries).find(
      (entry) => entry.username === submitted.username,
    );
    // Comparing needs the saved password; with the vault locked, saying nothing beats asking to unlock it.
    if (saved && !this.deps.vaultSession.isOpen()) {
      return;
    }
    if (saved && this.deps.vaultSession.vault.reveal(saved.id) === submitted.password) {
      return;
    }
    this.held = {
      id: randomUUID(),
      tabId,
      site,
      username: submitted.username,
      kind: saved ? 'update' : 'save',
      origin: submitted.origin,
      password: submitted.password,
      entryId: saved?.id ?? null,
    };
    this.deps.changed();
  }
}
