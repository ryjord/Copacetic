// Utils
import { isFillablePage } from '../../shared/passwords/credential-matching';
import { addressFillScriptFor } from '../system/address-fill-script';
import { t } from '../../shared/i18n/translate';

// Types
import type { TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { VaultSession } from '../vault/vault-session';
import type { TabManager } from '../tabs/tabs';

interface AddressFillDeps {
  tabs: TabManager;
  vaultSession: VaultSession;
  notices: NoticeCentre;
}

/** Putting a saved address into the form in front of you, when you choose it, as Fill password does. */
export class AddressFill {
  constructor(private readonly deps: AddressFillDeps) {}

  async fill(tabId: TabId, addressId: string, point: { x: number; y: number } | null): Promise<string> {
    const problem = await this.attemptFill(tabId, addressId, point);
    // Chosen from a menu, which has gone by the time this is known, so the reason has to be said.
    if (problem) {
      this.deps.notices.notify({ id: `fill-address-${tabId}`, tone: 'info', key: 'fill-address', message: problem });
    }
    return problem;
  }

  private async attemptFill(
    tabId: TabId,
    addressId: string,
    point: { x: number; y: number } | null,
  ): Promise<string> {
    if (!isFillablePage(this.deps.tabs.urlFor(tabId) ?? '')) {
      return t('main.addresses.fill.notEncrypted');
    }
    // Asking to fill is asking to unlock: the prompt comes here, not a trip to Settings.
    if (!this.deps.vaultSession.isOpen()) {
      const problem = await this.deps.vaultSession.unlock();
      if (problem) {
        return problem;
      }
    }
    const fields = await this.deps.vaultSession.addresses.fieldsOf(addressId);
    if (!fields) {
      return t('main.addresses.fill.locked');
    }
    // Checked again after every wait: the page may have gone somewhere unencrypted meanwhile.
    const contents = this.deps.tabs.livePageFor(tabId);
    if (!contents) {
      return t('main.addresses.fill.noPage');
    }
    if (!isFillablePage(contents.getURL())) {
      return t('main.addresses.fill.notEncrypted');
    }
    try {
      const result: unknown = await contents.executeJavaScript(addressFillScriptFor(fields, point), true);
      const filled = Reflect.get(Object(result), 'filled');
      return typeof filled === 'number' && filled > 0 ? '' : t('main.addresses.fill.noFields');
    } catch {
      return t('main.addresses.fill.rejected');
    }
  }
}
