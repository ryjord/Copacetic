// Larger than any page is long, so a hostile number in a session file cannot send a page anywhere strange.
const FURTHEST = 10_000_000;

/** How far across and down a page someone was, in CSS pixels. */
export interface ScrollPosition {
  x: number;
  y: number;
}

/** A position from a page or a saved session, trusted only as two whole numbers in range. */
export function readScrollPosition(value: unknown): ScrollPosition | null {
  const [x, y] = Array.isArray(value) ? value : [Reflect.get(Object(value), 'x'), Reflect.get(Object(value), 'y')];
  const isPlace = (number: unknown): number is number =>
    typeof number === 'number' && Number.isInteger(number) && number >= 0 && number <= FURTHEST;
  return isPlace(x) && isPlace(y) && (x > 0 || y > 0) ? { x, y } : null;
}
