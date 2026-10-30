import { describe, expect, it } from 'vitest';
import { insetsOfDrawnRect } from '../../../../electron/shared/tabs/content-insets';
import { contentBoundsWithin, normaliseInsets } from '../../../../electron/main/tabs/tab-layout';

const WINDOW = { width: 1280, height: 800 };

/** What the main process does with the insets it is sent: the page's rectangle in the window. */
const placed = (insets: ReturnType<typeof insetsOfDrawnRect>) => contentBoundsWithin(WINDOW, normaliseInsets(insets));

/**
 * The page slot sits on fractional pixels whenever anything above it does, and
 * each inset rounded on its own lost a pixel at one side or the other: the page
 * was placed a pixel narrower or wider than the slot drawn for it.
 */
describe('the page slot the chrome draws, as the main process places it', () => {
  const fractions = [0, 0.25, 0.5, 0.75];
  const slots = fractions.flatMap((leftFraction) =>
    fractions.map((rightFraction) => ({
      top: 88 + leftFraction,
      left: 8 + leftFraction,
      right: 1272 - rightFraction,
      bottom: 792 - rightFraction,
    })),
  );

  it.each(slots)('lands on the drawn edges exactly, at $left to $right', (slot) => {
    const bounds = placed(insetsOfDrawnRect(slot, WINDOW));
    expect(bounds.x).toBe(Math.round(slot.left));
    expect(bounds.y).toBe(Math.round(slot.top));
    expect(bounds.x + bounds.width).toBe(Math.round(slot.right));
    expect(bounds.y + bounds.height).toBe(Math.round(slot.bottom));
  });

  it('places a whole-pixel slot where it is', () => {
    expect(placed(insetsOfDrawnRect({ top: 88, left: 8, right: 1272, bottom: 792 }, WINDOW))).toEqual({
      x: 8,
      y: 88,
      width: 1264,
      height: 704,
    });
  });
});
