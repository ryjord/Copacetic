/**
 * What a page can be offered when it asks to share the screen.
 *
 * Choosing is the consent, so nothing is shared without a person picking it,
 * and nothing about the choice is remembered. Copacetic's own window is never
 * offered: sharing it would show the address bar and every tab title to the
 * page that asked.
 */

export interface DisplaySource {
  id: string;
  name: string;
}

/** Native dialogs hold a handful of buttons, not every window on the machine. */
export const MAX_WINDOW_CHOICES = 8;

export function displayChoices(sources: readonly DisplaySource[], ownWindowName: string): DisplaySource[] {
  const screens = sources.filter((source) => source.id.startsWith('screen:'));
  const windows = sources
    .filter((source) => source.id.startsWith('window:'))
    .filter((source) => source.name.trim() !== '' && source.name !== ownWindowName)
    .slice(0, MAX_WINDOW_CHOICES);
  return [
    ...screens.map((screen, index) => ({ ...screen, name: screenLabel(screen, index, screens.length) })),
    ...windows,
  ];
}

function screenLabel(screen: DisplaySource, index: number, count: number): string {
  if (count === 1) {
    return 'Entire screen';
  }
  return screen.name.trim() || `Screen ${index + 1}`;
}
