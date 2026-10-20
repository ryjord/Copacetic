// Types
import type { CSSProperties } from 'react';
import { ambientLightStopsFor, ambientStopsFor } from '@shared/chrome/ambient';
import type { ThemeId } from '@shared/types';

/** Both pairs for one colour, set on an element marked `data-ambient-preview` so it paints that colour in either appearance. */
export function ambientPreviewStyle(theme: ThemeId, hue: number): CSSProperties {
  const dark = ambientStopsFor(theme, hue);
  const light = ambientLightStopsFor(theme, hue);
  return {
    '--ambient-near-dark': dark.near,
    '--ambient-far-dark': dark.far,
    '--ambient-near-light': light.near,
    '--ambient-far-light': light.far,
  };
}
