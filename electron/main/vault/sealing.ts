// Utils
import { t } from '../../shared/i18n/translate';

// Types
import type { SecretStore } from './vault';

/**
 * The keychain, as everything kept in the vault uses it: base64 in and out,
 * null rather than a throw where it will not seal or open, and never a
 * fallback to the clear. Passwords and addresses go through the same three.
 */
export async function isKeychainAvailable(secrets: SecretStore): Promise<boolean> {
  try {
    return await secrets.isAvailable();
  } catch {
    return false;
  }
}

/** Base64 of the sealed text, or null where the keychain would not seal it. */
export async function sealText(secrets: SecretStore, plainText: string): Promise<string | null> {
  try {
    return (await secrets.encrypt(plainText)).toString('base64');
  } catch {
    return null;
  }
}

/** The text, and whether the keychain has a newer key to seal it under, or null where this machine cannot open it. */
export async function openText(
  secrets: SecretStore,
  sealed: string,
): Promise<{ result: string; shouldReEncrypt: boolean } | null> {
  if (!(await isKeychainAvailable(secrets))) {
    return null;
  }
  try {
    return await secrets.decrypt(Buffer.from(sealed, 'base64'));
  } catch {
    return null;
  }
}

export async function whyKeychainUnavailable(secrets: SecretStore): Promise<string> {
  return (await secrets.whyUnavailable?.()) || t('main.vault.keychain.none');
}
