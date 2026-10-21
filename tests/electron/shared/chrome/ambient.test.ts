import { describe, expect, it } from 'vitest';
import {
  AMBIENT_FAR,
  AMBIENT_FAR_LIGHT,
  AMBIENT_NEAR,
  AMBIENT_NEAR_LIGHT,
  ambientHexFor,
  ambientStopsFor,
  hexToHsl,
  hslToHex,
  hueForAmbientHex,
} from '../../../../electron/shared/chrome/ambient';

/** Degrees are a circle, so 359 and 1 are two apart rather than 358. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The slider and the hex field edit one value between them, so what has to hold
 * is that they agree - whichever was touched last.
 *
 * Not to the exact degree, and it cannot be: a hex carries eight bits a
 * channel, so a colour cannot always name the precise angle it came from, and
 * the flatter the theme the less precision there is. Measured across all four
 * and every degree, the worst disagreement is 2° - on slate, which is the least
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
 * belong to the theme - reading those from whatever someone pasted is how a
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

  // A grey has no hue to read, so reading one is inventing an answer.
  it.each([
    ['text that is not a colour', 'not a colour', null],
    ['a hex that is too short', '#12', null],
    ['an empty string', '', null],
    ['a hex of non-hex digits', '#gggggg', null],
    ['white', '#ffffff', null],
    ['black', '#000000', null],
    ['a mid grey', '#808080', null],
    ['a dark grey', '#3a3a3a', null],
    ['a colour with its hash', '#123043', 'a hue'],
    ['a colour without its hash', '123043', 'a hue'],
    ['a colour that has a hue', '#43122f', 'a hue'],
  ])('reads %s', (_caseName, input, expected) => {
    const hue = hueForAmbientHex('deep', input);
    if (expected === null) {
      expect(hue).toBeNull();
    } else {
      expect(hue).not.toBeNull();
    }
  });
});

describe('the conversion itself', () => {
  it('reads black and white and survives a round trip through hsl', () => {
    for (const [hex, hue, saturation, lightness] of [
      ['#000000', 0, 0, 0],
      ['#ffffff', 0, 0, 1],
    ] as const) {
      const hsl = hexToHsl(hex);
      expect(hsl?.h).toBeCloseTo(hue, 3);
      expect(hsl?.s).toBeCloseTo(saturation, 3);
      expect(hsl?.l).toBeCloseTo(lightness, 3);
    }
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

/** The colours live in one place, for both appearances, and the stylesheet reads them. */
describe('the stylesheet and the colours', () => {
  // A light start page is still a background behind dark text.
  it('has a light colour for every dark one, and keeps every light colour light', () => {
    expect(Object.keys(AMBIENT_NEAR_LIGHT).sort()).toEqual(Object.keys(AMBIENT_NEAR).sort());
    expect(Object.keys(AMBIENT_FAR_LIGHT).sort()).toEqual(Object.keys(AMBIENT_FAR).sort());
    for (const hex of [...Object.values(AMBIENT_NEAR_LIGHT), ...Object.values(AMBIENT_FAR_LIGHT)]) {
      expect(hexToHsl(hex)?.l ?? 0).toBeGreaterThan(0.8);
    }
  });
});

/**
 * The colour the field names is the colour the page paints, because the turn
 * happens here and CSS is handed the answer.
 *
 * It used to be a `hue-rotate()` filter, which is a colour matrix rather than a
 * rotation: it moves saturation and lightness too. Measured against a real
 * matrix, the field and the screen disagreed by up to 23 of 255 per channel -
 * deep named #121343 and painted #242a4d.
 */
describe('what is named is what is painted', () => {
  it.each(Object.keys(AMBIENT_NEAR))('%s paints the colour the field shows', (theme) => {
    for (const hue of [0, 35, 120, 240, 300]) {
      expect(ambientStopsFor(theme, hue).near).toBe(ambientHexFor(theme, hue));
    }
  });

  it('turns both stops, so the pair keeps its relationship', () => {
    const turned = ambientStopsFor('deep', 90);
    const near = hexToHsl(turned.near);
    const far = hexToHsl(turned.far);
    const themeNear = hexToHsl(AMBIENT_NEAR.deep as string);
    const themeFar = hexToHsl(AMBIENT_FAR.deep as string);

    const before = ((themeFar as never as { h: number }).h - (themeNear as never as { h: number }).h + 360) % 360;
    const after = ((far as never as { h: number }).h - (near as never as { h: number }).h + 360) % 360;
    // The same two degrees of hex rounding the round-trip above allows for.
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });
});
