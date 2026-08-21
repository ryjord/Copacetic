import { describe, expect, it } from 'vitest';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import {
  DEFAULT_RECIPE,
  MAX_LENGTH,
  MIN_LENGTH,
  alphabetsFor,
  clampLength,
  entropyBits,
  generatePassword,
  type PasswordRecipe,
  type RandomBytes,
} from '../../electron/shared/password-generator';

const real: RandomBytes = (count) => new Uint8Array(nodeRandomBytes(count));

/** Hands back exactly these bytes, so the sampling can be watched rather than guessed at. */
function scripted(values: readonly number[]): RandomBytes {
  let index = 0;
  return () => new Uint8Array([values[index++ % values.length] ?? 0]);
}

const recipe = (overrides: Partial<PasswordRecipe> = {}): PasswordRecipe => ({ ...DEFAULT_RECIPE, ...overrides });

describe('the shape of what comes out', () => {
  it.each([8, 12, 20, 64, 128])('is exactly %i characters long', (length) => {
    expect(generatePassword(recipe({ length }), real)).toHaveLength(length);
  });

  it.each([
    ['lower', { useLower: true, useUpper: false, useDigits: false, useSymbols: false }, /^[a-z]+$/],
    ['upper', { useLower: false, useUpper: true, useDigits: false, useSymbols: false }, /^[A-Z]+$/],
    ['digits', { useLower: false, useUpper: false, useDigits: true, useSymbols: false }, /^[0-9]+$/],
  ])('uses only %s when only that is asked for', (_name, options, pattern) => {
    expect(generatePassword(recipe(options), real)).toMatch(pattern);
  });

  // A password missing a kind the site insisted on is rejected at the form, and
  // the person has to start again with no idea why.
  it('contains at least one of every kind that was asked for', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const password = generatePassword(recipe({ length: 8 }), real);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });

  // Read aloud, or typed off a screen, these are the ones people get wrong.
  it.each(['l', 'I', '1', 'O', '0'])('never contains the ambiguous character %s', (character) => {
    const alphabet = alphabetsFor(recipe()).join('');
    expect(alphabet).not.toContain(character);
  });

  it('returns nothing rather than something weak when no kinds are chosen', () => {
    const none = recipe({ useLower: false, useUpper: false, useDigits: false, useSymbols: false });
    expect(generatePassword(none, real)).toBe('');
  });

  it('never returns a password too short to hold one of each kind', () => {
    expect(generatePassword(recipe({ length: 1 }), real).length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * The bug this file exists to catch. Taking a byte modulo the alphabet size is
 * the usual shortcut, and it makes the first characters of the alphabet come up
 * more often — which weakens every password produced and is invisible in the
 * output.
 */
describe('drawing without bias', () => {
  it('throws away the uneven tail rather than folding it back', () => {
    // With a 25-character alphabet the even range is 0..249. Byte 250 must be
    // rejected; a modulo shortcut would fold it back onto 'a'.
    const lowerOnly = recipe({ length: 8, useUpper: false, useDigits: false, useSymbols: false });
    const alphabet = alphabetsFor(lowerOnly)[0] as string;
    const rejected = 250;
    expect(rejected % alphabet.length).toBe(0);

    const password = generatePassword(lowerOnly, scripted([rejected, 5]));
    expect(password).not.toContain(alphabet[0]);
    expect(password).toBe(alphabet[5]?.repeat(8));
  });

  it('is not fooled into a loop by a source that only returns tail values', () => {
    const lowerOnly = recipe({ length: 8, useUpper: false, useDigits: false, useSymbols: false });
    expect(() => generatePassword(lowerOnly, scripted([255]))).not.toThrow();
  });

  // A real distribution check: no character should be dramatically more common
  // than another. Modulo bias over this alphabet shows up as roughly a third
  // more of the early characters, which this catches.
  it('spreads characters evenly over many draws', () => {
    const lowerOnly = recipe({ length: 64, useUpper: false, useDigits: false, useSymbols: false });
    const alphabet = alphabetsFor(lowerOnly)[0] as string;
    const counts = new Map<string, number>();

    for (let round = 0; round < 400; round += 1) {
      for (const character of generatePassword(lowerOnly, real)) {
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
    }

    const seen = [...counts.values()];
    const expected = (400 * 64) / alphabet.length;
    expect(counts.size).toBe(alphabet.length);
    expect(Math.min(...seen)).toBeGreaterThan(expected * 0.8);
    expect(Math.max(...seen)).toBeLessThan(expected * 1.2);
  });

  it('does not repeat itself', () => {
    const produced = new Set(Array.from({ length: 500 }, () => generatePassword(recipe(), real)));
    expect(produced.size).toBe(500);
  });

  /**
   * Without a shuffle the guaranteed characters stay where they were placed, so
   * position 0 is always a lowercase letter, position 1 always uppercase, and
   * so on. The password still looks random and has lost most of its strength.
   * Checking that the first character varies is not enough — it varies across
   * twenty-five lowercase letters. The *kind* has to vary.
   */
  it.each([0, 1, 2, 3])('draws every kind of character at position %i', (position) => {
    const kinds = new Set(
      Array.from({ length: 400 }, () => {
        const character = generatePassword(recipe({ length: 8 }), real)[position] ?? '';
        if (/[a-z]/.test(character)) {
          return 'lower';
        }
        if (/[A-Z]/.test(character)) {
          return 'upper';
        }
        if (/[0-9]/.test(character)) {
          return 'digit';
        }
        return 'symbol';
      }),
    );
    expect([...kinds].sort()).toEqual(['digit', 'lower', 'symbol', 'upper']);
  });
});

describe('the length it will accept', () => {
  it.each([
    [0, MIN_LENGTH],
    [1, MIN_LENGTH],
    [7, MIN_LENGTH],
    [20, 20],
    [1000, MAX_LENGTH],
    [Number.NaN, DEFAULT_RECIPE.length],
  ])('turns %s into %i', (asked, expected) => {
    expect(clampLength(asked)).toBe(expected);
  });
});

describe('what it can honestly say about strength', () => {
  it('reports more bits for a longer password', () => {
    expect(entropyBits(recipe({ length: 24 }))).toBeGreaterThan(entropyBits(recipe({ length: 12 })));
  });

  it('reports more bits for a wider alphabet', () => {
    const narrow = recipe({ useUpper: false, useDigits: false, useSymbols: false });
    expect(entropyBits(recipe())).toBeGreaterThan(entropyBits(narrow));
  });

  it('claims nothing when there is no alphabet', () => {
    expect(entropyBits(recipe({ useLower: false, useUpper: false, useDigits: false, useSymbols: false }))).toBe(0);
  });
});
