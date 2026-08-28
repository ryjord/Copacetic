/**
 * A theme is a pair of colours with a relationship someone chose. The hue lever
 * turns the pair rather than replacing either, so the relationship survives
 * whatever it is turned to.
 *
 * The hex field is the same value said differently: it shows where the near
 * colour has landed, and typing one works out the turn that would land there.
 * There is one value underneath, so the two can never disagree.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** The four atmospheres, as the stylesheet defines them. Kept in step with globals.css by the test that reads both. */
export const AMBIENT_NEAR: Record<string, string> = {
  deep: '#123043',
  slate: '#1e2730',
  ember: '#3a1f21',
  moss: '#16302a',
};

export const AMBIENT_FAR: Record<string, string> = {
  deep: '#1b2a4a',
  slate: '#2a3440',
  ember: '#46281c',
  moss: '#1d3a2b',
};

export function hexToHsl(hex: string): Hsl | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? span / (2 - max - min) : span / (max + min);
  let h: number;
  if (max === r) {
    h = ((g - b) / span + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / span + 2) / 6;
  } else {
    h = ((r - g) / span + 4) / 6;
  }
  return { h: h * 360, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const channel = (offset: number): number => {
    let t = hue + offset;
    if (t < 0) {
      t += 1;
    }
    if (t > 1) {
      t -= 1;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    let value = p;
    if (t < 1 / 6) {
      value = p + (q - p) * 6 * t;
    } else if (t < 1 / 2) {
      value = q;
    } else if (t < 2 / 3) {
      value = p + (q - p) * (2 / 3 - t) * 6;
    }
    return Math.round(value * 255);
  };
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(channel(1 / 3))}${hex(channel(0))}${hex(channel(-1 / 3))}`;
}

/** Where the theme's near colour lands once the atmosphere has been turned. */
export function ambientHexFor(theme: string, hue: number): string {
  const base = hexToHsl(AMBIENT_NEAR[theme] ?? AMBIENT_NEAR.deep ?? '#123043');
  if (!base) {
    return '#123043';
  }
  return hslToHex({ ...base, h: base.h + hue });
}

/**
 * The turn that would land the near colour on this colour. Only the hue is
 * read: the lightness and saturation belong to the theme, and taking those
 * from a typed colour is how a start page ends up unreadable.
 */
export function hueForAmbientHex(theme: string, hex: string): number | null {
  const wanted = hexToHsl(hex);
  const base = hexToHsl(AMBIENT_NEAR[theme] ?? AMBIENT_NEAR.deep ?? '#123043');
  if (!wanted || !base) {
    return null;
  }
  return Math.round((((wanted.h - base.h) % 360) + 360) % 360);
}
