import { describe, expect, it, vi } from 'vitest';
import { PasswordSave } from '../../../../electron/main/workflows/password-save';
import { DEFAULT_SETTINGS } from '../../../../electron/main/data/settings-store';

const TAB = 'tab-1';
const SIGN_IN = 'https://accounts.example.com/signin';

interface Saved {
  id: string;
  origin: string;
  username: string;
  password: string;
}

/** A page whose watch answers with what was sent each time it is asked, then waits for good. */
function setup(
  options: { saved?: Saved[]; isOpen?: boolean; isHush?: boolean; url?: string; settings?: object } = {},
) {
  let url = options.url ?? SIGN_IN;
  const sent: unknown[] = [];
  const contents = {
    getURL: () => url,
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn(async () => (sent.length > 0 ? sent.shift() : new Promise(() => {}))),
  };
  const saved = options.saved ?? [];
  const vault = {
    state: () => ({ entries: saved.map(({ id, origin, username }) => ({ id, origin, username })) }),
    reveal: (id: string) => saved.find((entry) => entry.id === id)?.password ?? null,
    add: vi.fn(() => ({ id: 'new' })),
    update: vi.fn(() => null),
  };
  const neverOn = vi.fn();
  const changed = vi.fn();
  let now = 1_000;
  const save = new PasswordSave({
    tabs: { contentsForTab: () => contents, isHush: () => options.isHush === true } as never,
    vaultSession: { vault, isOpen: () => options.isOpen ?? true, facts: () => ({ hasKeychain: true }) } as never,
    notices: { notify: vi.fn() } as never,
    settings: () => ({ ...DEFAULT_SETTINGS, ...options.settings }),
    neverOn,
    changed,
    now: () => now,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    save,
    vault,
    neverOn,
    contents,
    /** The page is loaded, the person sends the form, and the page moves on. */
    async signIn(submitted: { username: string; password: string }, nextUrl = 'https://example.com/home') {
      sent.push(submitted);
      save.pageChanged(TAB, 'loaded');
      await settle();
      url = nextUrl;
      save.pageChanged(TAB, 'committed');
    },
    sendOnly(submitted: { username: string; password: string }) {
      sent.push(submitted);
      save.pageChanged(TAB, 'loaded');
      return settle();
    },
    later: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe('offering to save a password', () => {
  it('offers to save one signed in with, and tells the window nothing of the password', async () => {
    const { save, signIn } = setup();
    await signIn({ username: 'riley@example.com', password: 'secret' });
    const offer = save.offer();
    expect(offer).toMatchObject({ tabId: TAB, site: 'example.com', username: 'riley@example.com', kind: 'save' });
    expect(JSON.stringify(offer)).not.toContain('secret');
  });

  it('offers nothing until the page moves on, so a failed sign-in offers nothing', async () => {
    const { save, sendOnly } = setup();
    await sendOnly({ username: 'riley', password: 'mistyped' });
    expect(save.offer()).toBeNull();
  });

  it('offers nothing when the page moves on long after the form was sent', async () => {
    const { save, sendOnly, later } = setup();
    await sendOnly({ username: 'riley', password: 'secret' });
    later(61_000);
    save.pageChanged(TAB, 'committed');
    expect(save.offer()).toBeNull();
  });

  it('carries the username over from the step before the password', async () => {
    const { save, sendOnly, signIn } = setup();
    await sendOnly({ username: 'riley@example.com', password: '' });
    await signIn({ username: '', password: 'secret' });
    expect(save.offer()).toMatchObject({ username: 'riley@example.com' });
  });

  it('offers an update for a saved username with another password, and nothing for the same one', async () => {
    const saved = [{ id: 'kept', origin: 'https://example.com', username: 'riley', password: 'old' }];
    const changing = setup({ saved });
    await changing.signIn({ username: 'riley', password: 'new' });
    expect(changing.save.offer()).toMatchObject({ kind: 'update' });

    const same = setup({ saved });
    await same.signIn({ username: 'riley', password: 'old' });
    expect(same.save.offer()).toBeNull();
  });

  // Comparing needs the saved password, and asking to unlock the vault mid-sign-in is worse than saying nothing.
  it('says nothing about a saved username while the vault is locked', async () => {
    const { save, signIn } = setup({
      saved: [{ id: 'kept', origin: 'https://example.com', username: 'riley', password: 'old' }],
      isOpen: false,
    });
    await signIn({ username: 'riley', password: 'new' });
    expect(save.offer()).toBeNull();
  });

  it.each([
    ['a Hush tab', { isHush: true }],
    ['a page that is not encrypted', { url: 'http://example.com/signin' }],
    ['a site it was told never to offer on', { settings: { neverSavePasswordsOn: ['example.com'] } }],
    ['a profile that turned the offer off', { settings: { offerToSavePasswords: false } }],
  ])('never watches %s', async (_name, options) => {
    const { save, signIn, contents } = setup(options);
    await signIn({ username: 'riley', password: 'secret' });
    expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    expect(save.offer()).toBeNull();
  });

  it('saves a new password, or updates the saved one, when told to', async () => {
    const saving = setup();
    await saving.signIn({ username: 'riley', password: 'secret' });
    saving.save.answer(saving.save.offer()?.id ?? '', 'save');
    expect(saving.vault.add).toHaveBeenCalledWith({
      origin: 'https://accounts.example.com',
      username: 'riley',
      password: 'secret',
    });
    expect(saving.save.offer()).toBeNull();

    const updating = setup({
      saved: [{ id: 'kept', origin: 'https://example.com', username: 'riley', password: 'old' }],
    });
    await updating.signIn({ username: 'riley', password: 'new' });
    updating.save.answer(updating.save.offer()?.id ?? '', 'save');
    expect(updating.vault.update).toHaveBeenCalledWith('kept', { password: 'new' });
  });

  it('remembers never for the site, and ignores an answer to an offer that has gone', async () => {
    const { save, signIn, neverOn, vault } = setup();
    await signIn({ username: 'riley', password: 'secret' });
    save.answer('not-this-one', 'save');
    expect(vault.add).not.toHaveBeenCalled();
    save.answer(save.offer()?.id ?? '', 'never');
    expect(neverOn).toHaveBeenCalledWith('example.com');
  });

  it('drops the offer when its tab closes', async () => {
    const { save, signIn } = setup();
    await signIn({ username: 'riley', password: 'secret' });
    save.forget(TAB);
    expect(save.offer()).toBeNull();
  });
});
