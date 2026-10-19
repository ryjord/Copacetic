import { t } from './i18n/translate';

/** Which keychain holds the vault's key, or why there is none, in the words settings shows. */
export interface KeychainDescription {
  /** Empty when there is no keychain to name. */
  name: string;
  /** Empty when the keychain is usable. */
  problem: string;
}

const LINUX_KEYRINGS: Record<string, string> = {
  gnome_libsecret: 'GNOME Keyring',
  kwallet: 'KWallet',
  kwallet5: 'KWallet',
  kwallet6: 'KWallet',
};

/**
 * Chromium's Linux fallback, basic_text, encrypts with a key every copy of
 * Chromium shares; Copacetic refuses it, and says why rather than only that.
 */
export function describeKeychain(
  platform: string,
  backend: string | null,
  isAvailable: boolean,
): KeychainDescription {
  if (platform === 'linux' && backend === 'basic_text') {
    return {
      name: '',
      problem: t('main.vault.keychain.noKeyring'),
    };
  }
  if (!isAvailable) {
    return { name: '', problem: t('main.vault.keychain.none') };
  }
  if (platform === 'darwin') {
    return { name: t('main.vault.keychain.macos'), problem: '' };
  }
  if (platform === 'win32') {
    return { name: t('main.vault.keychain.windows'), problem: '' };
  }
  return { name: LINUX_KEYRINGS[backend ?? ''] ?? t('main.vault.keychain.desktopKeyring'), problem: '' };
}
