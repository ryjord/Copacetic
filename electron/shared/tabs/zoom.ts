import { clampZoom } from '../types';

/** Chromium's own zoom ladder, so Copacetic steps through the levels people already know. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export type ZoomDirection = 'in' | 'out';

// A zoom typed into settings may sit between two steps; it moves to the next one beyond it.
export function nextZoomStep(zoomFactor: number, direction: ZoomDirection): number {
  const current = clampZoom(zoomFactor);
  const beyond =
    direction === 'in'
      ? ZOOM_STEPS.find((step) => step > current + 0.001)
      : ZOOM_STEPS.toReversed().find((step) => step < current - 0.001);
  return beyond ?? current;
}

/** Whether a tab's zoom differs from the default enough to be worth showing. */
export function isZoomedFrom(zoomFactor: number, defaultZoomFactor: number): boolean {
  return Math.abs(zoomFactor - defaultZoomFactor) >= 0.001;
}

export function formatZoom(zoomFactor: number): string {
  return `${Math.round(zoomFactor * 100)}%`;
}
