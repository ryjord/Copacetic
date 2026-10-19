import { describe, expect, it } from 'vitest';
import { MAX_WINDOW_CHOICES, displayChoices } from '../../../../electron/shared/chrome/display-sources';

const screen = (id: number, name = `Screen ${id}`) => ({ id: `screen:${id}:0`, name });
const window = (id: number, name: string) => ({ id: `window:${id}:0`, name });

describe('what a page may be offered when it asks to share the screen', () => {
  it('puts screens first and calls a lone screen what it is', () => {
    expect(displayChoices([window(1, 'Notes'), screen(1)], 'Copacetic')).toEqual([
      { id: 'screen:1:0', name: 'Entire screen' },
      { id: 'window:1:0', name: 'Notes' },
    ]);
  });

  it('keeps each screen apart when there are several', () => {
    const names = displayChoices([screen(1, 'Built-in'), screen(2, '')], 'Copacetic').map((choice) => choice.name);
    expect(names).toEqual(['Built-in', 'Screen 2']);
  });

  // Sharing Copacetic itself would show the page every tab title and the address bar.
  it('never offers Copacetic’s own window', () => {
    expect(displayChoices([screen(1), window(2, 'Copacetic')], 'Copacetic').map((choice) => choice.id)).toEqual([
      'screen:1:0',
    ]);
  });

  it('leaves out windows with no name, and keeps the list short enough to choose from', () => {
    const many = Array.from({ length: 20 }, (_unused, index) => window(index, `Window ${index}`));
    const choices = displayChoices([window(99, '  '), ...many], 'Copacetic');
    expect(choices).toHaveLength(MAX_WINDOW_CHOICES);
    expect(choices.some((choice) => choice.id === 'window:99:0')).toBe(false);
  });
});
