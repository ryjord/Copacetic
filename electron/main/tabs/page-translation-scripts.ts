// A world of its own, past the sign-in watch, picture in picture and the scroll position (1031 to 1033).
export const PAGE_TRANSLATION_WORLD = 1034;

// Past this a page is a document to read in reader view, not one to translate in place.
export const MOST_PIECES = 4_000;
const MOST_CHARACTERS = 200_000;

/**
 * The sixth script in pages, run only when Translate this page is chosen. It
 * reads the page's visible text, piece by piece, and keeps the text nodes in
 * its own world, which the page cannot see or reach, so the translations can
 * be put back in place and the originals after them. Script, style, code and
 * anything typed into a form are left alone.
 */
export const COLLECT_PAGE_TEXT = `(() => {
  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'PRE', 'SVG', 'MATH', 'TEMPLATE']);
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!/[\\p{L}]/u.test(node.data)) {
        return NodeFilter.FILTER_REJECT;
      }
      for (let element = node.parentElement; element; element = element.parentElement) {
        if (skipped.has(element.tagName.toUpperCase()) || element.isContentEditable || element.translate === false) {
          return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let characters = 0;
  while (walker.nextNode() && nodes.length < ${MOST_PIECES} && characters < ${MOST_CHARACTERS}) {
    nodes.push(walker.currentNode);
    characters += walker.currentNode.data.length;
  }
  globalThis.copaceticPageText = { nodes, originals: nodes.map((node) => node.data) };
  return { language: document.documentElement.lang || '', texts: nodes.map((node) => node.data.trim()) };
})()`;

/**
 * Puts each translation where its piece was, keeping the spaces around it; a
 * piece the page has since dropped is skipped. `offset` is where in the page's
 * pieces these start, so a long page changes batch by batch as they arrive.
 */
export function applyTranslationsScript(translations: readonly string[], offset = 0): string {
  // Serialised as JSON, so nothing a translation says can become code.
  return `(() => {
  const kept = globalThis.copaceticPageText;
  if (!kept) {
    return 0;
  }
  const translations = ${JSON.stringify(translations)};
  const offset = ${Math.max(0, Math.floor(offset))};
  let applied = 0;
  kept.nodes.slice(offset, offset + translations.length).forEach((node, place) => {
    const index = offset + place;
    const translation = translations[place];
    if (typeof translation !== 'string' || !translation || !node.isConnected) {
      return;
    }
    const original = kept.originals[index];
    const leading = original.match(/^\\s*/)[0];
    const trailing = original.match(/\\s*$/)[0];
    node.data = leading + translation + trailing;
    applied += 1;
  });
  return applied;
})()`;
}

/**
 * The seventh, run when a page has loaded, only while offers to translate are
 * on: it reads the language the page says it is in, one attribute, and nothing
 * of what the page says.
 */
export const READ_PAGE_LANGUAGE = `document.documentElement.lang || ''`;

/** Puts every piece back as the page had it. */
export const RESTORE_PAGE_TEXT = `(() => {
  const kept = globalThis.copaceticPageText;
  if (!kept) {
    return 0;
  }
  kept.nodes.forEach((node, index) => {
    if (node.isConnected) {
      node.data = kept.originals[index];
    }
  });
  globalThis.copaceticPageText = undefined;
  return kept.nodes.length;
})()`;
