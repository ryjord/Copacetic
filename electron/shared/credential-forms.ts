// Every rule here is a guess about markup nobody agreed on — a wrong save loses a password.

export interface FormField {
  /** The `type` attribute, lowercased. */
  type: string;
  name: string;
  id: string;
  /** The `autocomplete` attribute, lowercased. */
  autocomplete: string;
  value: string;
  /** False for fields the user could not have filled in, which are not evidence of anything. */
  isVisible: boolean;
}

export interface Credential {
  username: string;
  password: string;
}

export type FormKind = 'sign-in' | 'registration' | 'password-change';

export interface SubmittedForm {
  kind: FormKind;
  credential: Credential;
}

const USERNAME_HINTS = ['username', 'email', 'login', 'user', 'account', 'identifier'];
/** Fields that carry a code rather than a name, and are never worth storing. */
const NOT_A_USERNAME = ['otp', 'code', 'token', 'captcha', 'pin', 'verification'];

function describes(field: FormField, words: readonly string[]): boolean {
  const haystack = `${field.name} ${field.id} ${field.autocomplete}`.toLowerCase();
  return words.some((word) => haystack.includes(word));
}

// Read from the passwords, not the button text (translated) or the action URL (often a router path that says nothing).
export function classifyForm(fields: readonly FormField[]): FormKind | null {
  const passwords = fields.filter((field) => field.type === 'password' && field.isVisible && field.value !== '');

  if (passwords.length === 0) {
    return null;
  }

  if (passwords.length === 1) {
    // A single box the site itself calls new is a registration, whatever else
    // is on the page.
    return passwords[0]?.autocomplete.includes('new-password') ? 'registration' : 'sign-in';
  }

  const values = new Set(passwords.map((field) => field.value));

  if (passwords.length === 2) {
    // Two that match is a password and its confirmation. Two that differ is a
    // change: the old one and the new one.
    return values.size === 1 ? 'registration' : 'password-change';
  }

  // Current, new, confirm — or something stranger. Either way not a sign-in.
  return 'password-change';
}

/** The password worth keeping: the new one for a change, the only one otherwise. */
function passwordFrom(fields: readonly FormField[], kind: FormKind): string {
  const passwords = fields.filter((field) => field.type === 'password' && field.isVisible && field.value !== '');

  if (kind !== 'password-change') {
    return passwords[0]?.value ?? '';
  }

  const marked = passwords.find((field) => field.autocomplete.includes('new-password'));
  if (marked) {
    return marked.value;
  }

  // Unmarked, the convention is old first and the new one repeated after it.
  const repeated = passwords.find(
    (field, index) => passwords.findIndex((other) => other.value === field.value) !== index,
  );
  return repeated?.value ?? passwords[passwords.length - 1]?.value ?? '';
}

// An empty username beats a confident wrong one — some sites ask for it on an earlier screen.
export function usernameFrom(fields: readonly FormField[]): string {
  const firstPasswordIndex = fields.findIndex((field) => field.type === 'password' && field.isVisible);

  const candidates = fields.filter(
    (field, index) =>
      field.isVisible &&
      field.value !== '' &&
      ['text', 'email', 'tel', ''].includes(field.type) &&
      !describes(field, NOT_A_USERNAME) &&
      (firstPasswordIndex === -1 || index < firstPasswordIndex),
  );

  const declared = candidates.find(
    (field) => field.autocomplete.includes('username') || field.autocomplete.includes('email'),
  );
  if (declared) {
    return declared.value.trim();
  }

  const named = candidates.find((field) => describes(field, USERNAME_HINTS));
  if (named) {
    return named.value.trim();
  }

  // The box immediately before the password is the usual arrangement.
  return candidates[candidates.length - 1]?.value.trim() ?? '';
}

export function readSubmittedForm(fields: readonly FormField[]): SubmittedForm | null {
  const kind = classifyForm(fields);
  if (!kind) {
    return null;
  }

  const password = passwordFrom(fields, kind);
  if (!password) {
    return null;
  }

  return { kind, credential: { username: usernameFrom(fields), password } };
}
