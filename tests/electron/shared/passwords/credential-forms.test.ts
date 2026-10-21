import { describe, expect, it } from 'vitest';
import {
  classifyForm,
  readSubmittedForm,
  usernameFrom,
  type FormField,
} from '../../../../electron/shared/passwords/credential-forms';

function field(overrides: Partial<FormField> = {}): FormField {
  return { type: 'text', name: '', id: '', autocomplete: '', value: '', isVisible: true, ...overrides };
}

const password = (value: string, overrides: Partial<FormField> = {}) =>
  field({ type: 'password', value, ...overrides });

describe('what the form was for', () => {
  // The site saying so itself (autocomplete) beats counting boxes.
  it.each([
    ['one password as a sign-in', [field({ value: 'riley' }), password('hunter2')], 'sign-in'],
    [
      'a password marked as new as a registration',
      [password('hunter2', { autocomplete: 'new-password' })],
      'registration',
    ],
    ['two matching passwords as a registration', [password('hunter2'), password('hunter2')], 'registration'],
    ['two different passwords as a change', [password('old-one'), password('new-one')], 'password-change'],
    [
      'three passwords as a change, whatever they are',
      [password('old'), password('new'), password('new')],
      'password-change',
    ],
  ])('reads %s', (_caseName, fields, expected) => {
    expect(classifyForm(fields)).toBe(expected);
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
 * recognise, which is worse than filing it under none - so every rule here
 * prefers giving up to guessing.
 */
describe('finding the username', () => {
  it.each([
    [
      'the field the page declared',
      [
        field({ value: 'noise', name: 'referrer' }),
        field({ value: 'riley@example.com', autocomplete: 'username' }),
        password('hunter2'),
      ],
      'riley@example.com',
    ],
    ['one named like a username', [field({ value: 'riley', name: 'login_email' }), password('hunter2')], 'riley'],
    [
      'the box immediately before the password',
      [field({ value: 'first' }), field({ value: 'second' }), password('hunter2')],
      'second',
    ],
    ['the value trimmed', [field({ value: '  riley  ', autocomplete: 'username' }), password('x')], 'riley'],
  ])('takes %s', (_caseName, fields, expected) => {
    expect(usernameFrom(fields)).toBe(expected);
  });

  // A one-time code is not a name, and saving it would be worse than useless.
  it.each(['otp', 'verification_code', 'captcha', 'two_factor_token', 'account_pin'])(
    'never takes a field named %s',
    (name) => {
      expect(usernameFrom([field({ value: '123456', name }), password('hunter2')])).toBe('');
    },
  );

  it.each([
    ['anything after the password', [password('hunter2'), field({ value: 'remember-me-label' })]],
    ['hidden fields', [field({ value: 'csrf-token', isVisible: false }), password('hunter2')]],
    ['empty fields', [field({ value: '' }), password('hunter2')]],
    ['a name that was on a previous screen', [password('hunter2')]],
  ])('gives up rather than guessing on %s', (_caseName, fields) => {
    expect(usernameFrom(fields)).toBe('');
  });
});

describe('the password worth keeping', () => {
  // Storing the old password after a change is the worst outcome available:
  // silently wrong, and only discovered next time they try to sign in.
  it.each([
    ['the only one on a sign-in', [field({ value: 'riley' }), password('hunter2')], 'hunter2'],
    [
      'the new one on a change, when the page marks it',
      [password('old-one'), password('new-one', { autocomplete: 'new-password' })],
      'new-one',
    ],
    [
      'the repeated one on an unmarked change',
      [password('old-one'), password('new-one'), password('new-one')],
      'new-one',
    ],
    [
      'the confirmed one on a registration',
      [field({ value: 'riley' }), password('hunter2'), password('hunter2')],
      'hunter2',
    ],
  ])('is %s', (_caseName, fields, expected) => {
    expect(readSubmittedForm(fields)?.credential.password).toBe(expected);
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
