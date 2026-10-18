import { offerFor } from '../../shared/credential-matching';
import type { TabId } from '../../shared/types';
import type { VaultSession } from '../app/vault-session';
import { fillScriptFor } from '../system/fill-script';
import type { TabManager } from '../tabs/tabs';

interface PasswordFillDeps {
  tabs: TabManager;
  vaultSession: VaultSession;
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
    const url = this.deps.tabs.urlFor(tabId) ?? '';
    const offer = offerFor(url, this.deps.vaultSession.vault.state().entries);
    const entry = offer.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return offer.refusal || 'That password does not belong to this page.';
    }

    const password = this.deps.vaultSession.vault.reveal(entryId);
    if (password === null) {
      return 'The vault is locked, or that password cannot be decrypted on this machine.';
    }

    const contents = this.deps.tabs.contentsForTab(tabId);
    if (!contents) {
      return 'There is no page here to fill.';
    }

    try {
      const result = (await contents.executeJavaScript(fillScriptFor(entry.username, password), true)) as {
        filled: boolean;
        exact?: boolean;
      };
      if (!result?.filled) {
        return 'No password box was found on this page.';
      }
      if (result.exact === false) {
        return 'Filled, but this password contains a line break and the box on this page cannot hold one. Sign-in will fail; paste it yourself.';
      }
      return '';
    } catch {
      return 'The page would not accept it.';
    }
  }
}
