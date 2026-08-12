/**
 * Generating a password is the one place in this project where "looks random"
 * and "is random" are different things, and nothing about the output reveals
 * which one you got.
 */

export interface PasswordRecipe {
  length: number;
  useLower: boolean;
  useUpper: boolean;
  useDigits: boolean;
  useSymbols: boolean;
}

/** Bytes from a cryptographic source, passed in so the sampling can be tested. */
export type RandomBytes = (count: number) => Uint8Array;

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

export const DEFAULT_RECIPE: PasswordRecipe = {
  length: 20,
  useLower: true,
  useUpper: true,
  useDigits: true,
  useSymbols: true,
};

/**
 * `l` `I` `1` `O` `0` are left out on purpose. A password that cannot be read
 * aloud or typed off a screen gets written down somewhere worse.
 */
export function alphabetsFor(recipe: PasswordRecipe): string[] {
  const alphabets: string[] = [];
  if (recipe.useLower) {
    alphabets.push(LOWER);
  }
  if (recipe.useUpper) {
    alphabets.push(UPPER);
  }
  if (recipe.useDigits) {
    alphabets.push(DIGITS);
  }
  if (recipe.useSymbols) {
    alphabets.push(SYMBOLS);
  }
  return alphabets;
}

/**
 * A number below `limit`, with no bias. Taking a byte modulo the alphabet size
 * is the usual shortcut and it is wrong: 256 does not divide by 25, so the
 * first few characters come up more often. Values in the uneven tail are
 * thrown away and redrawn instead.
 */
function uniformIndex(limit: number, randomBytes: RandomBytes): number {
  if (limit <= 0) {
    return 0;
  }
  const ceiling = Math.floor(256 / limit) * limit;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const value = randomBytes(1)[0] ?? 0;
    if (value < ceiling) {
      return value % limit;
    }
  }
  // Only reachable if the source keeps returning tail values; still uniform
  // enough to be better than looping forever.
  return (randomBytes(1)[0] ?? 0) % limit;
}

function shuffle(characters: string[], randomBytes: RandomBytes): string[] {
  const shuffled = [...characters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = uniformIndex(index + 1, randomBytes);
    const held = shuffled[index] as string;
    shuffled[index] = shuffled[swap] as string;
    shuffled[swap] = held;
  }
  return shuffled;
}

export function clampLength(length: number): number {
  if (!Number.isFinite(length)) {
    return DEFAULT_RECIPE.length;
  }
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(length)));
}

/**
 * One character from each chosen kind, the rest from all of them, then shuffled
 * — rather than generating and retrying until it happens to qualify. Retrying
 * biases towards whatever the check happens to accept.
 */
export function generatePassword(recipe: PasswordRecipe, randomBytes: RandomBytes): string {
  const alphabets = alphabetsFor(recipe);
  if (alphabets.length === 0) {
    return '';
  }

  const length = Math.max(clampLength(recipe.length), alphabets.length);
  const everything = alphabets.join('');
  const characters: string[] = [];

  for (const alphabet of alphabets) {
    characters.push(alphabet[uniformIndex(alphabet.length, randomBytes)] as string);
  }
  while (characters.length < length) {
    characters.push(everything[uniformIndex(everything.length, randomBytes)] as string);
  }

  return shuffle(characters, randomBytes).join('');
}

/** Roughly how much guessing it would take, for saying something true about it. */
export function entropyBits(recipe: PasswordRecipe): number {
  const alphabet = alphabetsFor(recipe).join('');
  if (alphabet.length === 0) {
    return 0;
  }
  return Math.round(Math.max(clampLength(recipe.length), alphabetsFor(recipe).length) * Math.log2(alphabet.length));
}
