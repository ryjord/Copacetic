import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AMBIENT_FAR,
  AMBIENT_NEAR,
  ambientHexFor,
  hexToHsl,
  hslToHex,
  hueForAmbientHex,
} from '../../electron/shared/ambient';

/** Degrees are a circle, so 359 and 1 are two apart rather than 358. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The slider and the hex field edit one value between them, so what has to hold
 * is that they agree — whichever was touched last.
 *
 * Not to the exact degree, and it cannot be: a hex carries eight bits a
 * channel, so a colour cannot always name the precise angle it came from, and
 * the flatter the theme the less precision there is. Measured across all four
 * and every degree, the worst disagreement is 2° — on slate, which is the least
 * saturated of them. That is invisible, and it is the format rather than a bug.
 */
describe('the two ways of saying the same thing', () => {
  it.each(Object.keys(AMBIENT_NEAR))('round-trips for %s, within a degree or two', (theme) => {
    for (let hue = 0; hue < 360; hue += 1) {
      const back = hueForAmbientHex(theme, ambientHexFor(theme, hue));
      expect(apart(back as number, hue)).toBeLessThanOrEqual(2);
    }
  });

  it('shows the theme itself when nothing has been turned', () => {
    for (const [theme, hex] of Object.entries(AMBIENT_NEAR)) {
      expect(ambientHexFor(theme, 0).toLowerCase()).toBe(hex.toLowerCase());
    }
  });
});

/**
 * Only the hue is taken from a typed colour. Its lightness and saturation
 * belong to the theme — reading those from whatever someone pasted is how a
 * start page ends up too bright to read the clock against.
 */
describe('what a typed colour is allowed to change', () => {
  it('takes the hue and leaves the depth alone', () => {
    const hue = hueForAmbientHex('deep', '#ffdd00');
    const landed = hexToHsl(ambientHexFor('deep', hue as number));
    const theme = hexToHsl(AMBIENT_NEAR.deep as string);

    expect(landed?.l).toBeCloseTo(theme?.l as number, 5);
    expect(landed?.s).toBeCloseTo(theme?.s as number, 5);
  });

  it('refuses what is not a colour', () => {
    expect(hueForAmbientHex('deep', 'not a colour')).toBeNull();
    expect(hueForAmbientHex('deep', '#12')).toBeNull();
    expect(hueForAmbientHex('deep', '')).toBeNull();
    expect(hexToHsl('#gggggg')).toBeNull();
  });

  it('accepts a colour with or without its hash', () => {
    expect(hexToHsl('123043')).not.toBeNull();
    expect(hexToHsl('#123043')).not.toBeNull();
  });
});

describe('the conversion itself', () => {
  it.each([
    ['#000000', 0, 0, 0],
    ['#ffffff', 0, 0, 1],
  ])('reads %s', (hex, h, s, l) => {
    const hsl = hexToHsl(hex);
    expect(hsl?.h).toBeCloseTo(h, 3);
    expect(hsl?.s).toBeCloseTo(s, 3);
    expect(hsl?.l).toBeCloseTo(l, 3);
  });

  it('survives a round trip through hsl', () => {
    for (const hex of Object.values(AMBIENT_NEAR)) {
      expect(hslToHex(hexToHsl(hex) as never).toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  // A turn past the end of the wheel is still a turn.
  it('wraps rather than clipping', () => {
    expect(ambientHexFor('deep', 360)).toBe(ambientHexFor('deep', 0));
    expect(hslToHex({ h: 400, s: 0.5, l: 0.5 })).toBe(hslToHex({ h: 40, s: 0.5, l: 0.5 }));
  });
});

/**
 * These colours are written down twice: once in the stylesheet the browser
 * paints from, and once here so a preview can paint the same thing. Two copies
 * of one fact drift, so this is what notices.
 */
describe('the atmospheres match the stylesheet', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');

  const declared = (theme: string, variable: string): string | null => {
    const block =
      theme === 'deep'
        ? css.slice(css.indexOf(':root {'), css.indexOf("[data-density='compact']"))
        : css.slice(css.indexOf(`[data-theme='${theme}']`));
    return new RegExp(`--ambient-${variable}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1]?.toLowerCase() ?? null;
  };

  it.each(Object.keys(AMBIENT_NEAR))('%s is the colour the stylesheet uses', (theme) => {
    expect(declared(theme, 'near')).toBe(AMBIENT_NEAR[theme]?.toLowerCase());
    expect(declared(theme, 'far')).toBe(AMBIENT_FAR[theme]?.toLowerCase());
  });
});
