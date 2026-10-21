// Libs
import { randomUUID } from 'node:crypto';

// Utils
import { entriesForPage, isFillablePage, siteOf } from '../../shared/passwords/credential-matching';
import { SIGN_IN_WATCH_SCRIPT, STILL_ASKS_FOR_PASSWORD } from '../system/sign-in-watch-script';
import { t } from '../../shared/i18n/translate';
import { isRecord } from '../data/persistence';

// Types
import type { WebContents } from 'electron';
import type { PasswordOffer, PasswordOfferAnswer, Settings, TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { VaultSession } from '../vault/vault-session';
import type { TabManager } from '../tabs/tabs';

// A world of its own, apart from the page's (0) and the one Electron gives a preload (999).
const WATCH_WORLD = 1031;
// A sign-in that worked moves the page on at once; a move this long after is someone going elsewhere.
const MOVED_ON_WITHIN_MS = 10_000;
// A single-page sign-in draws what it shows next after moving its address; this long is enough.
const SETTLED_AFTER_MS = 1000;
// A page that draws its form after loading is looked at again once, this long after.
const LOOKED_AGAIN_AFTER_MS = 3000;
// An offer nobody answers goes, and the password it holds with it.
const OFFER_KEPT_MS = 5 * 60_000;
// The username of a sign-in that asks for it on one page and the password on the next.
const USERNAME_KEPT_MS = 60_000;
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
  hasMovedOn: boolean;
}

interface HeldOffer extends PasswordOffer {
  origin: string;
  password: string;
  /** The saved entry an update would change. */
  entryId: string | null;
  /** The site the offer was made on, which the tab leaving takes the offer with it. */
  shownOn: string | null;
  at: number;
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

const later = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Offering to save a password you have just signed in with. The fields are read
 * in a world the page cannot reach, and the password stays in the main process:
 * the window is told only the site and the username. The offer comes once the
 * page has moved on and no longer asks for a password, so one refused offers nothing.
 */
export class PasswordSave {
  private readonly submitted = new Map<TabId, Submitted>();
  private readonly usernames = new Map<TabId, Omit<Submitted, 'password' | 'hasMovedOn'>>();
  // Counted per document, so a watch's answer from a page that has gone is not taken for the one there now.
  private readonly documents = new Map<TabId, number>();
  private readonly watching = new Set<TabId>();
  private readonly offers = new Map<TabId, HeldOffer>();
  // The offer of a tab that closed, such as a sign-in pop-up closing itself, shown on whichever tab is in front.
  private orphan: HeldOffer | null = null;

  constructor(private readonly deps: PasswordSaveDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** The offer for the tab in front, as the window may know it. */
  offerFor(activeTabId: TabId | null): PasswordOffer | null {
    this.dropExpired();
    const held = (activeTabId === null ? undefined : this.offers.get(activeTabId)) ?? this.orphan;
    if (!held) {
      return null;
    }
    const { id, site, username, kind } = held;
    return { id, tabId: activeTabId ?? held.tabId, site, username, kind };
  }

  pageChanged(tabId: TabId, change: PageChange): void {
    if (change === 'committed') {
      this.documents.set(tabId, (this.documents.get(tabId) ?? 0) + 1);
      this.watching.delete(tabId);
    }
    if (change !== 'loaded') {
      this.movedOn(tabId);
    }
    if (change !== 'committed') {
      void this.judge(tabId, change === 'in-page' ? SETTLED_AFTER_MS : 0);
      void this.watch(tabId);
    }
  }

  forget(tabId: TabId): void {
    const held = this.offers.get(tabId);
    const submitted = this.submitted.get(tabId);
    // A pop-up that signed in and closed itself: closing is how it says it worked.
    const orphan = held ?? (submitted?.hasMovedOn ? this.offerOf(tabId, submitted, null) : null);
    this.submitted.delete(tabId);
    this.usernames.delete(tabId);
    this.documents.delete(tabId);
    this.watching.delete(tabId);
    this.offers.delete(tabId);
    if (orphan) {
      this.orphan = orphan;
    }
    this.deps.changed();
  }

  answer(id: string, answer: PasswordOfferAnswer): void {
    const tabId = [...this.offers].find(([, held]) => held.id === id)?.[0];
    const held = tabId === undefined ? (this.orphan?.id === id ? this.orphan : null) : this.offers.get(tabId);
    if (!held) {
      return;
    }
    if (tabId === undefined) {
      this.orphan = null;
    } else {
      this.offers.delete(tabId);
    }
    this.deps.changed();
    if (answer === 'never') {
      this.deps.neverOn(held.site);
    } else if (answer === 'save') {
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

  private dropExpired(): void {
    const isExpired = (held: HeldOffer) => this.now() - held.at > OFFER_KEPT_MS;
    [...this.offers].filter(([, held]) => isExpired(held)).forEach(([tabId]) => this.offers.delete(tabId));
    if (this.orphan && isExpired(this.orphan)) {
      this.orphan = null;
    }
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

  private watchable(tabId: TabId): WebContents | null {
    const contents = this.deps.tabs.contentsForTab(tabId);
    const isWatchable = contents && !this.deps.tabs.isHush(tabId) && this.isWatched(contents.getURL());
    return isWatchable ? contents : null;
  }

  // One watch per document: the one already there sees a form drawn after the address moved, too.
  private async watch(tabId: TabId, isLookingAgain = false): Promise<void> {
    const contents = this.watchable(tabId);
    if (!contents || this.watching.has(tabId)) {
      return;
    }
    const url = contents.getURL();
    const page = this.documents.get(tabId) ?? 0;
    this.watching.add(tabId);
    let found: unknown = null;
    try {
      found = await contents.executeJavaScriptInIsolatedWorld(WATCH_WORLD, [{ code: SIGN_IN_WATCH_SCRIPT }]);
    } catch {
      // A page that went before answering has nothing to say.
    }
    if (this.documents.get(tabId) !== page || contents.isDestroyed()) {
      return;
    }
    this.watching.delete(tabId);
    const submitted = readSubmitted(found);
    if (submitted) {
      this.remember(tabId, url, submitted);
      // The same page can be sent again, after a mistyped password.
      void this.watch(tabId);
    } else if (!isLookingAgain) {
      await later(LOOKED_AGAIN_AFTER_MS);
      if (this.documents.get(tabId) === page) {
        void this.watch(tabId, true);
      }
    }
  }

  private remember(tabId: TabId, url: string, submitted: { username: string; password: string }): void {
    const origin = new URL(url).origin;
    const at = this.now();
    if (!submitted.password) {
      this.usernames.set(tabId, { origin, username: submitted.username, at });
      return;
    }
    const earlier = this.usernames.get(tabId);
    const isEarlierStep =
      earlier !== undefined && siteOf(earlier.origin) === siteOf(origin) && at - earlier.at < USERNAME_KEPT_MS;
    const username = submitted.username || (isEarlierStep ? earlier.username : '');
    this.submitted.set(tabId, { origin, username, password: submitted.password, at, hasMovedOn: false });
  }

  private movedOn(tabId: TabId): void {
    const url = this.deps.tabs.contentsForTab(tabId)?.getURL() ?? '';
    const held = this.offers.get(tabId);
    if (held && siteOf(url) !== held.shownOn) {
      this.offers.delete(tabId);
      this.deps.changed();
    }
    const submitted = this.submitted.get(tabId);
    if (submitted && this.now() - submitted.at <= MOVED_ON_WITHIN_MS) {
      submitted.hasMovedOn = true;
    } else {
      this.submitted.delete(tabId);
    }
  }

  // Where the page went: one that still asks for a password on the same site was a refusal, not a sign-in.
  private async judge(tabId: TabId, settleMs: number): Promise<void> {
    if (!this.submitted.get(tabId)?.hasMovedOn) {
      return;
    }
    await later(settleMs);
    const submitted = this.submitted.get(tabId);
    const contents = this.deps.tabs.contentsForTab(tabId);
    if (!submitted?.hasMovedOn || !contents || contents.isDestroyed()) {
      return;
    }
    this.submitted.delete(tabId);
    const url = contents.getURL();
    const isSameSite = siteOf(url) === siteOf(submitted.origin);
    let stillAsks = false;
    try {
      stillAsks =
        isSameSite &&
        (await contents.executeJavaScriptInIsolatedWorld(WATCH_WORLD, [{ code: STILL_ASKS_FOR_PASSWORD }])) === true;
    } catch {
      return;
    }
    const offer = stillAsks ? null : this.offerOf(tabId, submitted, siteOf(url));
    if (offer) {
      this.offers.set(tabId, offer);
      this.deps.changed();
    }
  }

  private offerOf(tabId: TabId, submitted: Submitted, shownOn: string | null): HeldOffer | null {
    const site = siteOf(submitted.origin);
    // Asked again here: the switch, the keychain or the Never list can have changed since the page was watched.
    if (!site || !this.isWatched(submitted.origin)) {
      return null;
    }
    const saved = entriesForPage(submitted.origin, this.deps.vaultSession.vault.state().entries).find(
      (entry) => entry.username === submitted.username,
    );
    // Comparing needs the saved password; with the vault locked, saying nothing beats asking to unlock it.
    if (saved && !this.deps.vaultSession.isOpen()) {
      return null;
    }
    if (saved && this.deps.vaultSession.vault.reveal(saved.id) === submitted.password) {
      return null;
    }
    return {
      id: randomUUID(),
      tabId,
      site,
      username: submitted.username,
      kind: saved ? 'update' : 'save',
      origin: submitted.origin,
      password: submitted.password,
      entryId: saved?.id ?? null,
      shownOn,
      at: this.now(),
    };
  }
}
