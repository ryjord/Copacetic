import { describe, expect, it } from 'vitest';
import { fillScriptFor } from '../electron/main/fill-script';

/**
 * A stand-in for just enough of a page to run the script against. Records what
 * was set rather than pretending to be a browser.
 */
function fakePage({ hasPassword = true, hasUsername = true } = {}) {
  const set: { type: string; value: string }[] = [];
  const events: string[] = [];

  const field = (type: string) => ({
    type,
    disabled: false,
    readOnly: false,
    form: null as unknown,
    _value: '',
    // The element is what the script reads back from, so it needs the accessor
    // too — the prototype setter alone is not enough on a plain object.
    get value(): string {
      return this._value;
    },
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    dispatchEvent: (event: { type: string }) => events.push(event.type),
    focus: () => {},
  });

  const usernameField = field('text');
  const passwordField = field('password');
  const all = [...(hasUsername ? [usernameField] : []), ...(hasPassword ? [passwordField] : [])];

  const query = (selector: string) => (selector.includes('password') ? (hasPassword ? [passwordField] : []) : all);

  const context = {
    document: { querySelectorAll: query },
    Event: class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
    window: {
      HTMLInputElement: {
        prototype: {},
      },
    },
  } as Record<string, unknown>;

  // The script reaches for the native value setter; give it one that records.
  Object.defineProperty(
    (context.window as { HTMLInputElement: { prototype: object } }).HTMLInputElement.prototype,
    'value',
    {
      // Stores as well as records: the script reads the value back to check the
      // page did not alter it, so a setter that only records looks like alteration.
      set(this: { type: string; _value: string }, next: string) {
        this._value = next;
        set.push({ type: this.type, value: next });
      },
      get(this: { _value: string }) {
        return this._value;
      },
      configurable: true,
    },
  );

  return { context, set, events };
}

function run(script: string, page: ReturnType<typeof fakePage>) {
  const keys = Object.keys(page.context);
  const values = keys.map((key) => page.context[key]);
  return new Function(...keys, `return ${script};`)(...values) as { filled: boolean; filledUsername?: boolean };
}

/**
 * The password is interpolated into a string that becomes code. Anything short
 * of proper escaping turns a password containing a quote into an injection
 * against the very page it is being handed to. Checked by running the script
 * and reading back what it set, rather than by matching strings — a value that
 * needs no escaping looks identical either way, which is how a weaker version
 * of this test passed while proving nothing.
 */
describe('values that would break a naive interpolation', () => {
  it.each([
    ['a double quote', 'pass"word'],
    ['a single quote', "pass'word"],
    ['a backslash', 'pass\\word'],
    ['a newline', 'pass\nword'],
    ['a closing script tag', '</script><script>alert(1)</script>'],
    ['a template literal', '${alert(1)}'],
    ['a string terminator and code', '";alert(1);const x="'],
    ['every quote at once', `'"\`\\`],
  ])('arrives exactly as written: %s', (_name, password) => {
    const page = fakePage();
    const result = run(fillScriptFor('riley', password), page);
    expect(result.filled).toBe(true);
    expect(page.set.find((entry) => entry.type === 'password')?.value).toBe(password);
  });

  it('carries the username through unchanged too', () => {
    const page = fakePage();
    run(fillScriptFor('"; alert(1); //', 'hunter2'), page);
    expect(page.set.find((entry) => entry.type === 'text')?.value).toBe('"; alert(1); //');
  });
});

describe('what it does to the page', () => {
  it('reports when there is no password field rather than guessing', () => {
    const result = run(fillScriptFor('riley', 'hunter2'), fakePage({ hasPassword: false }));
    expect(result.filled).toBe(false);
  });

  it('fills the password even when there is no username field', () => {
    const page = fakePage({ hasUsername: false });
    const result = run(fillScriptFor('riley', 'hunter2'), page);
    expect(result.filled).toBe(true);
    expect(result.filledUsername).toBe(false);
  });

  /**
   * React and its relatives listen for input events rather than watching the
   * value, so a direct assignment leaves the page's own state empty and the
   * form submits nothing — which reads to the user as a wrong password.
   */
  it('dispatches the events a framework needs to notice', () => {
    const page = fakePage();
    run(fillScriptFor('riley', 'hunter2'), page);
    expect(page.events).toContain('input');
    expect(page.events).toContain('change');
  });
});

describe('what it leaves behind', () => {
  it('is a single expression with no listener and no global', () => {
    const script = fillScriptFor('riley', 'hunter2');
    expect(script.startsWith('(() => {')).toBe(true);
    expect(script.trimEnd().endsWith('})()')).toBe(true);
    expect(script).not.toContain('addEventListener');
    expect(script).not.toContain('window.copacetic');
  });

  // It hands a value over; it must never read the page back.
  it('never reads page content', () => {
    const script = fillScriptFor('riley', 'hunter2');
    for (const forbidden of ['document.cookie', 'innerText', 'innerHTML', 'localStorage', 'fetch(']) {
      expect(script).not.toContain(forbidden);
    }
  });
});

/**
 * A single-line input silently drops newlines. A password saved with one would
 * arrive shorter than it was stored, and the only symptom is a sign-in that
 * fails for no visible reason — so the script compares and says so.
 */
describe('when the page cannot hold the value', () => {
  it('reports an exact fill for an ordinary password', () => {
    const page = fakePage();
    const result = run(fillScriptFor('riley', 'hunter2'), page) as { exact?: boolean };
    expect(result.exact).toBe(true);
  });

  it('compares what the field ended up with rather than assuming', () => {
    const script = fillScriptFor('riley', 'a\nb');
    expect(script).toContain('exact: passwordField.value === password');
  });
});
