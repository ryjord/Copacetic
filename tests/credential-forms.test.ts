import { describe, expect, it } from 'vitest';
import { classifyForm, readSubmittedForm, usernameFrom, type FormField } from '../electron/shared/credential-forms';

function field(overrides: Partial<FormField> = {}): FormField {
  return { type: 'text', name: '', id: '', autocomplete: '', value: '', isVisible: true, ...overrides };
}

const password = (value: string, overrides: Partial<FormField> = {}) =>
  field({ type: 'password', value, ...overrides });

describe('what the form was for', () => {
  it('reads one password as a sign-in', () => {
    expect(classifyForm([field({ value: 'riley' }), password('hunter2')])).toBe('sign-in');
  });

  // The site said so itself, which beats counting boxes.
  it('believes autocomplete when it says the password is new', () => {
    expect(classifyForm([password('hunter2', { autocomplete: 'new-password' })])).toBe('registration');
  });

  it('reads two matching passwords as a registration', () => {
    expect(classifyForm([password('hunter2'), password('hunter2')])).toBe('registration');
  });

  it('reads two different passwords as a change', () => {
    expect(classifyForm([password('old-one'), password('new-one')])).toBe('password-change');
  });

  it('reads three as a change, whatever they are', () => {
    expect(classifyForm([password('old'), password('new'), password('new')])).toBe('password-change');
  });

  it.each([
    ['nothing at all', []],
    ['a form with no password', [field({ value: 'riley' })]],
    ['an empty password box', [password('')]],
    ['a hidden password box', [password('hunter2', { isVisible: false })]],
  ])('is not a credential form: %s', (_name, fields) => {
    expect(classifyForm(fields)).toBeNull();
  });
});

/**
 * A wrong username files the password under a name the person will not
 * recognise, which is worse than filing it under none — so every rule here
 * prefers giving up to guessing.
 */
describe('finding the username', () => {
  it('takes the field the page declared', () => {
    const fields = [
      field({ value: 'noise', name: 'referrer' }),
      field({ value: 'riley@example.com', autocomplete: 'username' }),
      password('hunter2'),
    ];
    expect(usernameFrom(fields)).toBe('riley@example.com');
  });

  it('falls back to one named like a username', () => {
    expect(usernameFrom([field({ value: 'riley', name: 'login_email' }), password('hunter2')])).toBe('riley');
  });

  it('otherwise takes the box immediately before the password', () => {
    const fields = [field({ value: 'first' }), field({ value: 'second' }), password('hunter2')];
    expect(usernameFrom(fields)).toBe('second');
  });

  // A one-time code is not a name, and saving it would be worse than useless.
  it.each(['otp', 'verification_code', 'captcha', 'two_factor_token', 'account_pin'])(
    'never takes a field named %s',
    (name) => {
      expect(usernameFrom([field({ value: '123456', name }), password('hunter2')])).toBe('');
    },
  );

  it('ignores anything after the password', () => {
    const fields = [password('hunter2'), field({ value: 'remember-me-label' })];
    expect(usernameFrom(fields)).toBe('');
  });

  it.each([
    ['hidden fields', [field({ value: 'csrf-token', isVisible: false }), password('hunter2')]],
    ['empty fields', [field({ value: '' }), password('hunter2')]],
  ])('ignores %s', (_name, fields) => {
    expect(usernameFrom(fields)).toBe('');
  });

  it('gives up rather than guessing when the name was on a previous screen', () => {
    expect(usernameFrom([password('hunter2')])).toBe('');
  });

  it('trims what it finds', () => {
    expect(usernameFrom([field({ value: '  riley  ', autocomplete: 'username' }), password('x')])).toBe('riley');
  });
});

describe('the password worth keeping', () => {
  it('is the only one on a sign-in', () => {
    expect(readSubmittedForm([field({ value: 'riley' }), password('hunter2')])?.credential.password).toBe('hunter2');
  });

  // Storing the old password after a change is the worst outcome available:
  // silently wrong, and only discovered next time they try to sign in.
  it('is the new one on a change, when the page marks it', () => {
    const fields = [password('old-one'), password('new-one', { autocomplete: 'new-password' })];
    expect(readSubmittedForm(fields)?.credential.password).toBe('new-one');
  });

  it('is the repeated one on an unmarked change', () => {
    const fields = [password('old-one'), password('new-one'), password('new-one')];
    expect(readSubmittedForm(fields)?.credential.password).toBe('new-one');
  });

  it('is the confirmed one on a registration', () => {
    const fields = [field({ value: 'riley' }), password('hunter2'), password('hunter2')];
    expect(readSubmittedForm(fields)?.credential.password).toBe('hunter2');
  });
});

describe('putting it together', () => {
  it('reads an ordinary sign-in', () => {
    const result = readSubmittedForm([
      field({ value: 'csrf', name: 'authenticity_token', isVisible: false }),
      field({ value: 'riley@example.com', autocomplete: 'username' }),
      password('hunter2', { autocomplete: 'current-password' }),
    ]);
    expect(result).toEqual({ kind: 'sign-in', credential: { username: 'riley@example.com', password: 'hunter2' } });
  });

  it('returns nothing when there is nothing to save', () => {
    expect(readSubmittedForm([field({ value: 'a search query', name: 'q' })])).toBeNull();
  });
});
