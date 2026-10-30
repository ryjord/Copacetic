/** Where the chrome's layout drew the page slot, in CSS pixels, edges possibly fractional. */
export interface DrawnRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/**
 * The page slot's distance from each edge of the window, as the main process
 * places the page by. Each edge is rounded once and the insets are taken from
 * the rounded edges, so the size the main process works back to is exactly the
 * size drawn; rounding each inset on its own could put the page a pixel out.
 */
export function insetsOfDrawnRect(
  rect: DrawnRect,
  viewport: { width: number; height: number },
): { top: number; left: number; right: number; bottom: number } {
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    right: viewport.width - Math.round(rect.right),
    bottom: viewport.height - Math.round(rect.bottom),
  };
}
