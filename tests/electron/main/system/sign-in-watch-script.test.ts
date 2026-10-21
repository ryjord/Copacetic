import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGN_IN_WATCH_SCRIPT } from '../../../../electron/main/system/sign-in-watch-script';

// jsdom lays nothing out, so every field would read as hidden.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

// jsdom cannot make an event a person made, so this copy takes every event as one; the next describe uses the real one.
const AS_IF_TRUSTED = SIGN_IN_WATCH_SCRIPT.replace('event.isTrusted ?', 'true ?');

// Run as the main process runs it: an expression whose value is what comes back.
const run = (script: string): Promise<unknown> | null => new Function(`return ${script}`)();
const watch = () => run(AS_IF_TRUSTED);

const page = (html: string, values: Record<string, string>) => {
  document.body.innerHTML = html;
  Object.entries(values).forEach(([name, value]) => {
    const field = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (field) {
      field.value = value;
    }
  });
};

describe('what notices a sign-in', () => {
  it('leaves a page with nothing to sign in with at once, watching nothing', () => {
    page('<input type="search" name="q"><button>Go</button>', {});
    expect(watch()).toBeNull();
  });

  it('reads the username and password once the button is pressed', async () => {
    page('<input type="email" name="email"><input type="password" name="password"><button>Sign in</button>', {
      email: 'riley@example.com',
      password: 'secret',
    });
    const sent = watch();
    document.querySelector('button')?.click();
    expect(await sent).toEqual({ username: 'riley@example.com', password: 'secret' });
  });

  it('reads them when Enter is pressed in a field, with no button at all', async () => {
    page('<input type="text" name="login"><input type="password" name="password">', {
      login: 'riley',
      password: 'secret',
    });
    const sent = watch();
    document
      .querySelector('[name="password"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(await sent).toEqual({ username: 'riley', password: 'secret' });
  });

  // Google asks for the username on one page and the password on the next.
  it('reads a username on its own, for a sign-in that asks for the password next', async () => {
    page('<input type="email" name="identifier"><button>Next</button>', { identifier: 'riley@example.com' });
    const sent = watch();
    document.querySelector('button')?.click();
    expect(await sent).toEqual({ username: 'riley@example.com', password: '' });
  });

  // A change of password asks for the old one and the new one twice; the new one is what is kept.
  it('takes the last password filled in', async () => {
    page(
      '<input type="text" name="user"><input type="password" name="old"><input type="password" name="new"><input type="password" name="again"><button>Change</button>',
      { user: 'riley', old: 'before', new: 'after', again: 'after' },
    );
    const sent = watch();
    document.querySelector('button')?.click();
    expect(await sent).toEqual({ username: 'riley', password: 'after' });
  });

  it('waits while nothing has been filled in, rather than reporting an empty sign-in', async () => {
    page('<input type="email" name="email"><input type="password" name="password"><button>Sign in</button>', {});
    const sent = watch();
    document.querySelector('button')?.click();
    const later = Symbol('still waiting');
    expect(await Promise.race([sent, new Promise((resolve) => setTimeout(() => resolve(later), 20))])).toBe(later);
  });
});

describe('what a page does itself', () => {
  // A page clicking its own button could raise offers with a username of its choosing in Copacetic's own window.
  it('is not taken for someone signing in', async () => {
    page('<input type="email" name="email"><input type="password" name="password"><button>Sign in</button>', {
      email: 'forged@example.com',
      password: 'forged',
    });
    const sent = run(SIGN_IN_WATCH_SCRIPT);
    document.querySelector('button')?.click();
    const later = Symbol('still waiting');
    expect(await Promise.race([sent, new Promise((resolve) => setTimeout(() => resolve(later), 20))])).toBe(later);
  });

  it('answers nothing as the page goes, so nothing is left waiting', async () => {
    page('<input type="password" name="password">', {});
    const sent = run(SIGN_IN_WATCH_SCRIPT);
    window.dispatchEvent(new Event('pagehide'));
    expect(await sent).toBeNull();
  });
});
