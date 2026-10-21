import { describe, expect, it, vi } from 'vitest';
import { PasswordSave } from '../../../../electron/main/workflows/password-save';
import { STILL_ASKS_FOR_PASSWORD } from '../../../../electron/main/system/sign-in-watch-script';
import { DEFAULT_SETTINGS } from '../../../../electron/main/data/settings-store';

const TAB = 'tab-1';
const SIGN_IN = 'https://accounts.example.com/signin';

interface Saved {
  id: string;
  origin: string;
  username: string;
  password: string;
}

interface Options {
  saved?: Saved[];
  isOpen?: boolean;
  isHush?: boolean;
  url?: string;
  settings?: object;
}

/** A tab whose watch answers with each thing sent in turn, then waits for good. */
function setup(options: Options = {}) {
  let url = options.url ?? SIGN_IN;
  let stillAsks = false;
  const sent: unknown[] = [];
  const contents = {
    getURL: () => url,
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn(async (_world: number, [script]: { code: string }[]) => {
      if (script?.code === STILL_ASKS_FOR_PASSWORD) {
        return stillAsks;
      }
      return sent.length > 0 ? sent.shift() : new Promise(() => {});
    }),
  };
  const saved = options.saved ?? [];
  const vault = {
    state: () => ({ entries: saved.map(({ id, origin, username }) => ({ id, origin, username })) }),
    reveal: (id: string) => saved.find((entry) => entry.id === id)?.password ?? null,
    add: vi.fn(() => ({ id: 'new' })),
    update: vi.fn(() => null),
  };
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const neverOn = vi.fn();
  let now = 1_000;
  const save = new PasswordSave({
    tabs: { contentsForTab: () => contents, isHush: () => options.isHush === true } as never,
    vaultSession: { vault, isOpen: () => options.isOpen ?? true, facts: () => ({ hasKeychain: true }) } as never,
    notices: { notify: vi.fn() } as never,
    settings: () => settings,
    neverOn,
    changed: vi.fn(),
    now: () => now,
  });
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const loadedOn = async (nextUrl: string) => {
    url = nextUrl;
    save.pageChanged(TAB, 'committed');
    save.pageChanged(TAB, 'loaded');
    await settle();
  };
  return {
    save,
    vault,
    settings,
    neverOn,
    contents,
    offer: () => save.offerFor(TAB),
    /** The person sends the form on the page in front. */
    async send(submitted: { username: string; password: string }) {
      sent.push(submitted);
      save.pageChanged(TAB, 'loaded');
      await settle();
    },
    loadedOn,
    /** Sends the form, and the page moves on to where a sign-in that worked lands. */
    async signIn(submitted: { username: string; password: string }, landing = 'https://example.com/home') {
      sent.push(submitted);
      save.pageChanged(TAB, 'loaded');
      await settle();
      await loadedOn(landing);
    },
    refuseNext: () => {
      stillAsks = true;
    },
    passTime: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe('offering to save a password', () => {
  it('offers to save one signed in with, and tells the window nothing of the password', async () => {
    const { offer, signIn } = setup();
    await signIn({ username: 'riley@example.com', password: 'secret' });
    expect(offer()).toMatchObject({ tabId: TAB, site: 'example.com', username: 'riley@example.com', kind: 'save' });
    expect(JSON.stringify(offer())).not.toContain('secret');
  });

  it('offers nothing until the page moves on', async () => {
    const { offer, send } = setup();
    await send({ username: 'riley', password: 'mistyped' });
    expect(offer()).toBeNull();
  });

  // A site that answers a wrong password by showing its sign-in page again moves on too.
  it('offers nothing when the page it lands on still asks for a password', async () => {
    const { offer, signIn, refuseNext } = setup();
    refuseNext();
    await signIn({ username: 'riley', password: 'mistyped' }, 'https://accounts.example.com/signin?error=1');
    expect(offer()).toBeNull();
  });

  it('offers nothing when the page moves on long after the form was sent', async () => {
    const { offer, send, loadedOn, passTime } = setup();
    await send({ username: 'riley', password: 'secret' });
    passTime(11_000);
    await loadedOn('https://example.com/elsewhere');
    expect(offer()).toBeNull();
  });

  it('carries the username over from the step before the password', async () => {
    const { offer, send, signIn } = setup();
    await send({ username: 'riley@example.com', password: '' });
    await signIn({ username: '', password: 'secret' });
    expect(offer()).toMatchObject({ username: 'riley@example.com' });
  });

  it('offers an update for a saved username with another password, and nothing for the same one', async () => {
    const saved = [{ id: 'kept', origin: 'https://example.com', username: 'riley', password: 'old' }];
    const changing = setup({ saved });
    await changing.signIn({ username: 'riley', password: 'new' });
    expect(changing.offer()).toMatchObject({ kind: 'update' });

    const same = setup({ saved });
    await same.signIn({ username: 'riley', password: 'old' });
    expect(same.offer()).toBeNull();
  });

  // Comparing needs the saved password, and asking to unlock the vault mid-sign-in is worse than saying nothing.
  it('says nothing about a saved username while the vault is locked', async () => {
    const { offer, signIn } = setup({
      saved: [{ id: 'kept', origin: 'https://example.com', username: 'riley', password: 'old' }],
      isOpen: false,
    });
    await signIn({ username: 'riley', password: 'new' });
    expect(offer()).toBeNull();
  });

  it.each([
    ['a Hush tab', { isHush: true }],
    ['a page that is not encrypted', { url: 'http://example.com/signin' }],
    ['a site it was told never to offer on', { settings: { neverSavePasswordsOn: ['example.com'] } }],
    ['a profile that turned the offer off', { settings: { offerToSavePasswords: false } }],
  ])('never watches %s', async (_name, options) => {
    const { offer, signIn, contents } = setup(options);
    await signIn({ username: 'riley', password: 'secret' });
    expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
    expect(offer()).toBeNull();
  });

  // The page was watched before the answer, so the answer is asked for again when the offer would be made.
  it('makes no offer on a site said never to while its page was already watched', async () => {
    const { offer, send, loadedOn, settings } = setup();
    await send({ username: 'riley', password: 'secret' });
    settings.neverSavePasswordsOn = ['example.com'];
    await loadedOn('https://example.com/home');
    expect(offer()).toBeNull();
  });

  it('saves a new password, or updates the saved one, when told to', async () => {
    const saving = setup();
    await saving.signIn({ username: 'riley', password: 'secret' });
    saving.save.answer(saving.offer()?.id ?? '', 'save');
    expect(saving.vault.add).toHaveBeenCalledWith({
      origin: 'https://accounts.example.com',
      username: 'riley',
      password: 'secret',
    });
    expect(saving.offer()).toBeNull();

    const updating = setup({
      saved: [{ id: 'kept', origin: 'https://example.com', username: 'riley', password: 'old' }],
    });
    await updating.signIn({ username: 'riley', password: 'new' });
    updating.save.answer(updating.offer()?.id ?? '', 'save');
    expect(updating.vault.update).toHaveBeenCalledWith('kept', { password: 'new' });
  });

  it('remembers never for the site, and ignores an answer to an offer that has gone', async () => {
    const { offer, save, signIn, neverOn, vault } = setup();
    await signIn({ username: 'riley', password: 'secret' });
    save.answer('not-this-one', 'save');
    expect(vault.add).not.toHaveBeenCalled();
    save.answer(offer()?.id ?? '', 'never');
    expect(neverOn).toHaveBeenCalledWith('example.com');
  });

  it('takes the offer away when the tab goes to another site, or nobody answers it for long', async () => {
    const leaving = setup();
    await leaving.signIn({ username: 'riley', password: 'secret' });
    await leaving.loadedOn('https://example.com/inbox');
    expect(leaving.offer()).not.toBeNull();
    await leaving.loadedOn('https://news.example.org/');
    expect(leaving.offer()).toBeNull();

    const waiting = setup();
    await waiting.signIn({ username: 'riley', password: 'secret' });
    waiting.passTime(6 * 60_000);
    expect(waiting.offer()).toBeNull();
  });

  // A sign-in pop-up takes the password, moves on to the site that opened it, and closes itself.
  it('keeps the offer of a tab that closed, on whichever tab is in front', async () => {
    const { save, signIn } = setup();
    await signIn({ username: 'riley', password: 'secret' });
    save.forget(TAB);
    expect(save.offerFor('another-tab')).toMatchObject({ tabId: 'another-tab', username: 'riley' });
  });
});
