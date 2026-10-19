/** The two corners of the page something can be drawn over: leading for what a site asks, trailing for what the browser says. */
export const OVERLAY_REGIONS = ['leading', 'trailing'] as const;

export type OverlayRegion = (typeof OVERLAY_REGIONS)[number];

export function isOverlayRegion(value: unknown): value is OverlayRegion {
  return OVERLAY_REGIONS.some((region) => region === value);
}
