import type { Suggestion, SuggestionKind } from './types';

/** What the leading overlay draws under the address field while it is being edited. */
export interface SuggestionView {
  suggestions: Suggestion[];
  highlighted: number;
  /** The field's left edge and width, measured from the page's left edge. */
  left: number;
  width: number;
}

const KINDS: readonly SuggestionKind[] = ['url', 'search', 'history', 'bookmark'];
const MAX_SUGGESTIONS = 12;
const MAX_TEXT = 2048;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_TEXT ? value : null;
}

function toSuggestion(value: unknown): Suggestion | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const kind = KINDS.find((known) => known === candidate.kind);
  const id = text(candidate.id);
  const target = text(candidate.target);
  const title = text(candidate.title);
  const subtitle = text(candidate.subtitle);
  const favicon = candidate.faviconDataUrl;
  // An icon is only ever an image already in memory; anything else would be the overlay fetching on a page's behalf.
  const faviconDataUrl = typeof favicon === 'string' && favicon.startsWith('data:image/') ? favicon : null;
  if (!kind || id === null || target === null || title === null || subtitle === null) {
    return null;
  }
  return { id, kind, target, title, subtitle, faviconDataUrl };
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** The chrome's view, checked field by field before it is handed to another renderer. */
export function toSuggestionView(value: unknown): SuggestionView | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const suggestions = (Array.isArray(candidate.suggestions) ? candidate.suggestions : [])
    .slice(0, MAX_SUGGESTIONS)
    .map(toSuggestion)
    .filter((suggestion): suggestion is Suggestion => suggestion !== null);
  if (suggestions.length === 0) {
    return null;
  }
  return {
    suggestions,
    highlighted: Math.min(finite(candidate.highlighted), suggestions.length - 1),
    left: finite(candidate.left),
    width: finite(candidate.width),
  };
}
