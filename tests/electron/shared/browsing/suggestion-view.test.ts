import { describe, expect, it } from 'vitest';
import { toSuggestionView } from '../../../../electron/shared/browsing/suggestion-view';

const suggestion = (over: Record<string, unknown> = {}) => ({
  id: 'one',
  kind: 'history',
  target: 'https://example.com/',
  title: 'Example',
  subtitle: 'example.com',
  faviconDataUrl: null,
  ...over,
});

/** Passed from one renderer to another through the main process, so it is checked there field by field. */
describe('a suggestion view crossing to the overlay', () => {
  it('keeps a well-formed view as it is', () => {
    const view = { suggestions: [suggestion()], highlighted: 0, left: 120, width: 600 };
    expect(toSuggestionView(view)).toEqual(view);
  });

  it('is nothing when there is nothing to draw', () => {
    expect(toSuggestionView(null)).toBeNull();
    expect(toSuggestionView({ suggestions: [], highlighted: 0, left: 0, width: 0 })).toBeNull();
    expect(toSuggestionView('suggestions')).toBeNull();
  });

  it('drops a suggestion of a kind it does not know, or with a missing field', () => {
    const view = toSuggestionView({
      suggestions: [suggestion({ kind: 'script' }), suggestion({ id: 'two', title: 7 }), suggestion({ id: 'three' })],
      highlighted: 0,
      left: 0,
      width: 400,
    });
    expect(view?.suggestions.map((entry) => entry.id)).toEqual(['three']);
  });

  // The overlay draws an icon only from memory; any other address would be it fetching something.
  it('keeps an icon only when it is an image already in memory', () => {
    const view = toSuggestionView({
      suggestions: [
        suggestion({ faviconDataUrl: 'https://tracker.example/pixel.png' }),
        suggestion({ id: 'two', faviconDataUrl: 'data:image/png;base64,AAAA' }),
      ],
      highlighted: 0,
      left: 0,
      width: 400,
    });
    expect(view?.suggestions.map((entry) => entry.faviconDataUrl)).toEqual([null, 'data:image/png;base64,AAAA']);
  });

  it('keeps the highlight and the geometry inside sensible bounds', () => {
    const view = toSuggestionView({ suggestions: [suggestion()], highlighted: 9, left: -40, width: Number.NaN });
    expect(view).toMatchObject({ highlighted: 0, left: 0, width: 0 });
  });

  it('carries no more than a dozen', () => {
    const many = Array.from({ length: 30 }, (_unused, index) => suggestion({ id: `s${index}` }));
    expect(toSuggestionView({ suggestions: many, highlighted: 0, left: 0, width: 400 })?.suggestions).toHaveLength(
      12,
    );
  });
});
