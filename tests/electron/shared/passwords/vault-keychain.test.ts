import { describe, expect, it } from 'vitest';

import { describeKeychain } from '../../../../electron/shared/passwords/vault-keychain';

describe('describeKeychain', () => {
  it.each([
    ['darwin', null, 'the macOS Keychain'],
    ['win32', null, 'your Windows account'],
    ['linux', 'gnome_libsecret', 'GNOME Keyring'],
    ['linux', 'kwallet6', 'KWallet'],
    ['linux', 'unknown', 'your desktop keyring'],
  ])('names what holds the key on %s (%s)', (platform, backend, name) => {
    expect(describeKeychain(platform, backend, true)).toEqual({ name, problem: '' });
  });

  it('refuses the shared-key fallback whatever availability claims', () => {
    expect(describeKeychain('linux', 'basic_text', true).problem).toContain('No keyring is running');
  });

  it('says there is none when encryption is unavailable', () => {
    expect(describeKeychain('darwin', null, false)).toEqual({
      name: '',
      problem: expect.stringContaining('no keychain Copacetic can use'),
    });
  });
});
