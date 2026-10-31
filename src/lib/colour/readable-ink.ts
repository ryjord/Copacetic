/** The relative luminance WCAG measures contrast with, for a #rgb or #rrggbb colour; null for anything else. */
function luminanceOf(colour: string): number | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(colour);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  const channels = short ? short.slice(1).map((digit) => digit + digit) : long?.slice(1);
  if (!channels) {
    return null;
  }
  const [red = 0, green = 0, blue = 0] = channels.map((pair) => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const LIGHT_INK = '#ffffff';
const DARK_INK = '#121519';
const DARK_INK_LUMINANCE = luminanceOf(DARK_INK) ?? 0;

/** White or near-black text, whichever reads better on this background; white where the colour cannot be read. */
export function readableInkOn(background: string): string {
  const luminance = luminanceOf(background);
  if (luminance === null) {
    return LIGHT_INK;
  }
  const againstLight = 1.05 / (luminance + 0.05);
  const againstDark = (luminance + 0.05) / (DARK_INK_LUMINANCE + 0.05);
  return againstDark > againstLight ? DARK_INK : LIGHT_INK;
}
