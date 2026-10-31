// Libs
import { describe, expect, it, vi } from 'vitest';

// Utils
import { LOOKS_AGAIN_AT_MS, PasswordSave } from '../../../../electron/main/workflows/password-save';
import { SIGN_IN_WATCH_SCRIPT, STILL_ASKS_FOR_PASSWORD } from '../../../../electron/main/system/sign-in-watch-script';
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

/** A tab whose watch answers with what a person sends, waiting until they do, and with nothing as its page goes. */
function setup(options: Options = {}) {
  let url = options.url ?? SIGN_IN;
  let stillAsks = false;
  const sent: unknown[] = [];
  const waiting: ((value: unknown) => void)[] = [];
  const submit = (submitted: { username: string; password: string }) => {
    const watch = waiting.shift();
    if (watch) {
      watch(submitted);
    } else {
      sent.push(submitted);
    }
  };
  const contents = {
    getURL: () => url,
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn(async (_world: number, [script]: { code: string }[]) => {
      if (script?.code === STILL_ASKS_FOR_PASSWORD) {
        return stillAsks;
      }
      return sent.length > 0 ? sent.shift() : new Promise((resolve) => waiting.push(resolve));
    }),
  };
  const saved = options.saved ?? [];
  const vault = {
    state: async () => ({ entries: saved.map(({ id, origin, username }) => ({ id, origin, username })) }),
    reveal: async (id: string) => saved.find((entry) => entry.id === id)?.password ?? null,
    add: vi.fn(async () => ({ id: 'new' })),
    update: vi.fn(async () => null),
  };
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const neverOn = vi.fn();
  let now = 1_000;
  const save = new PasswordSave({
    tabs: { livePageFor: () => contents, isHush: () => options.isHush === true } as never,
    vaultSession: { vault, isOpen: () => options.isOpen ?? true, hasKeychain: async () => true } as never,
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
    waiting.splice(0).forEach((watch) => watch(null));
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
      submit(submitted);
      save.pageChanged(TAB, 'loaded');
      await settle();
    },
    loadedOn,
    /** Sends the form, and the page moves on to where a sign-in that worked lands. */
    async signIn(submitted: { username: string; password: string }, landing = 'https://example.com/home') {
      submit(submitted);
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
    expect(offer()).toMatchObject({ site: 'example.com', username: 'riley@example.com', kind: 'save' });
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
    // Lands on a plain page too, which is not watched either, so nothing at all is asked of the page.
    await signIn({ username: 'riley', password: 'secret' }, 'http://example.com/home');
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
    expect(save.offerFor('another-tab')).toMatchObject({ username: 'riley' });
  });
});

/**
 * A sign-in form drawn after the page loads, or in a dialog opened later, was
 * looked for at load and once more three seconds on, and then never again, so
 * signing in through it was never offered. Each look still stops at once where
 * there is no form; there are just a few more of them.
 */
describe('a sign-in form that appears after the page has loaded', () => {
  function pageWithNoForm() {
    const contents = {
      getURL: () => SIGN_IN,
      isDestroyed: () => false,
      // What the watch answers on a page with no form: nothing, at once.
      executeJavaScriptInIsolatedWorld: vi.fn(async () => null),
    };
    const save = new PasswordSave({
      tabs: { livePageFor: () => contents, isHush: () => false } as never,
      vaultSession: {
        vault: { state: async () => ({ entries: [] }) },
        isOpen: () => true,
        hasKeychain: async () => true,
      } as never,
      notices: { notify: vi.fn() } as never,
      settings: () => DEFAULT_SETTINGS,
      neverOn: vi.fn(),
      changed: vi.fn(),
      now: () => 1_000,
    });
    const looks = () =>
      contents.executeJavaScriptInIsolatedWorld.mock.calls.filter(
        (call) => (call as unknown as [number, { code: string }[]])[1]?.[0]?.code === SIGN_IN_WATCH_SCRIPT,
      ).length;
    return { save, looks };
  }

  it('is looked for again at each of the later times, and then no more', async () => {
    vi.useFakeTimers();
    const { save, looks } = pageWithNoForm();
    save.pageChanged(TAB, 'committed');
    save.pageChanged(TAB, 'loaded');
    await vi.advanceTimersByTimeAsync(0);
    expect(looks()).toBe(1);

    const elapsed = LOOKS_AGAIN_AT_MS.reduce(async (previous, lookAt, index) => {
      const since = await previous;
      await vi.advanceTimersByTimeAsync(lookAt - since);
      expect(looks()).toBe(index + 2);
      return lookAt;
    }, Promise.resolve(0));
    await elapsed;

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(looks()).toBe(4);
    vi.useRealTimers();
  });

  // A single-page site moves its address all the time; each move is looked at once, not on a schedule.
  it('is looked for once after a move within the page', async () => {
    vi.useFakeTimers();
    const { save, looks } = pageWithNoForm();
    save.pageChanged(TAB, 'in-page');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(looks()).toBe(1);
    vi.useRealTimers();
  });
});
