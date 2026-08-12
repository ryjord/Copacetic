const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
/** The bidi overrides that let text render right-to-left and reorder itself. */
const BIDI_OVERRIDES = new RegExp('[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');

/**
 * Text a page or a server chose, on its way into Copacetic's own interface.
 * Everything the user reads outside the page area has to come through here.
 */
export function sanitiseChromeText(value: string, maxLength: number): string {
  const cleaned = value
    // Whitespace controls become a space before the rest are removed: dropping
    // a newline outright would run the words either side of it together.
    .replace(/[\t\n\r\f\v]/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .replace(BIDI_OVERRIDES, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

const MAX_MENU_TEXT = 32;

/** The searched-for text is the page's, so it is sanitised like any other page string. */
export function searchSelectionLabel(selection: string): string {
  return `Search for “${sanitiseChromeText(selection, MAX_MENU_TEXT)}”`;
}

/** So is the misspelled word, which arrives straight out of the page's own input. */
export function addToDictionaryLabel(word: string): string {
  return `Add “${sanitiseChromeText(word, MAX_MENU_TEXT)}” to dictionary`;
}
