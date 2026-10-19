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

const NO_KEYCHAIN =
  'This machine has no keychain Copacetic can use, so there is nowhere safe to keep a password. Nothing has been saved.';

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
      problem:
        'No keyring is running, and the only fallback encrypts with a key every Chromium-based browser shares, so Copacetic will not save passwords. Start GNOME Keyring or KWallet, then restart Copacetic.',
    };
  }
  if (!isAvailable) {
    return { name: '', problem: NO_KEYCHAIN };
  }
  if (platform === 'darwin') {
    return { name: 'the macOS Keychain', problem: '' };
  }
  if (platform === 'win32') {
    return { name: 'your Windows account', problem: '' };
  }
  return { name: LINUX_KEYRINGS[backend ?? ''] ?? 'your desktop keyring', problem: '' };
}
