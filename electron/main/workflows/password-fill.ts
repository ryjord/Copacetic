// Utils
import { offerFor } from '../../shared/passwords/credential-matching';
import { fillScriptFor } from '../system/fill-script';
import { t } from '../../shared/i18n/translate';

// Types
import type { TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { VaultSession } from '../vault/vault-session';
import type { TabManager } from '../tabs/tabs';

interface PasswordFillDeps {
  tabs: TabManager;
  vaultSession: VaultSession;
  notices: NoticeCentre;
}

/** Putting a saved password into the page in front of you, when you ask. */
export class PasswordFill {
  constructor(private readonly deps: PasswordFillDeps) {}

  /** What could be filled into the page in this tab, or why nothing can be. */
  offerFor(tabId: TabId): { entries: { id: string; username: string }[]; refusal: string } {
    const url = this.deps.tabs.urlFor(tabId) ?? '';
    const offer = offerFor(url, this.deps.vaultSession.vault.state().entries);
    return { entries: offer.entries.map(({ id, username }) => ({ id, username })), refusal: offer.refusal };
  }

  /**
   * The only time Copacetic runs code inside a page, and only because you asked
   * for it by name. The offer is checked again here rather than trusted from the
   * renderer: the page may have navigated since the menu was built, and filling
   * into wherever it went now would be handing a password to whoever asked.
   */
  async fill(tabId: TabId, entryId: string): Promise<string> {
    const problem = await this.attemptFill(tabId, entryId);
    // Started from a menu, which has gone by the time this is known, so the reason has to be said.
    if (problem) {
      this.deps.notices.notify({
        id: `fill-password-${tabId}`,
        tone: 'info',
        key: 'fill-password',
        message: problem,
      });
    }
    return problem;
  }

  private entryFor(tabId: TabId, entryId: string): { entry?: { username: string }; refusal: string } {
    const url = this.deps.tabs.urlFor(tabId) ?? '';
    const offer = offerFor(url, this.deps.vaultSession.vault.state().entries);
    const entry = offer.entries.find((candidate) => candidate.id === entryId);
    return entry ? { entry, refusal: '' } : { refusal: offer.refusal || t('main.passwords.fill.wrongPage') };
  }

  private async attemptFill(tabId: TabId, entryId: string): Promise<string> {
    const beforeUnlock = this.entryFor(tabId, entryId);
    if (beforeUnlock.refusal) {
      return beforeUnlock.refusal;
    }

    // Asking to fill is asking to unlock: the prompt comes here, not a trip to Settings.
    if (!this.deps.vaultSession.isOpen()) {
      const problem = await this.deps.vaultSession.unlock();
      if (problem) {
        return problem;
      }
    }

    // Checked again: the page may have navigated while the prompt was up.
    const { entry, refusal } = this.entryFor(tabId, entryId);
    if (!entry) {
      return refusal;
    }

    const password = this.deps.vaultSession.vault.reveal(entryId);
    if (password === null) {
      return t('main.passwords.fill.locked');
    }

    const contents = this.deps.tabs.livePageFor(tabId);
    if (!contents) {
      return t('main.passwords.fill.noPage');
    }

    try {
      const result = (await contents.executeJavaScript(fillScriptFor(entry.username, password), true)) as {
        filled: boolean;
        exact?: boolean;
      };
      if (!result?.filled) {
        return t('main.passwords.fill.noBox');
      }
      if (result.exact === false) {
        return t('main.passwords.fill.lineBreak');
      }
      return '';
    } catch {
      return t('main.passwords.fill.rejected');
    }
  }
}
