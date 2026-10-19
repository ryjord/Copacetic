import { en } from './en';

/** A message that changes with a count: English needs one form for one and another for the rest. */
export interface Plural {
  one: string;
  other: string;
}

type Message = string | Plural;

/** Every key in the catalogue, as the dotted path to a message: `settings.privacy.httpsFirst.label`. */
type KeysOf<Tree, Prefix extends string = ''> = {
  [Key in keyof Tree & string]: Tree[Key] extends Message ? `${Prefix}${Key}` : KeysOf<Tree[Key], `${Prefix}${Key}.`>;
}[keyof Tree & string];

export type MessageKey = KeysOf<typeof en>;
export type MessageValues = Record<string, string | number>;

// English is the only language so far; another is a catalogue of the same shape, chosen here.
const ACTIVE_LOCALE = 'en';
const PLURALS = new Intl.PluralRules(ACTIVE_LOCALE);

function isPlural(value: unknown): value is Plural {
  return typeof value === 'object' && value !== null && 'one' in value && 'other' in value;
}

function lookup(key: string): Message | undefined {
  const found = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (typeof node === 'object' && node !== null ? Reflect.get(node, part) : undefined),
      en,
    );
  return typeof found === 'string' || isPlural(found) ? found : undefined;
}

/**
 * The words for a key, with `{name}` filled from `values`. A plural picks its
 * form from `values.count`. A key the catalogue lacks comes back as itself, so a
 * gap is visible on screen rather than silently empty.
 */
export function t(key: MessageKey, values: MessageValues = {}): string {
  const message = lookup(key);
  if (message === undefined) {
    return key;
  }
  const count = typeof values.count === 'number' ? values.count : 0;
  const text = isPlural(message) ? (PLURALS.select(count) === 'one' ? message.one : message.other) : message;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}
