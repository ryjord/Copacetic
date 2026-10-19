// Libs
import { Readability } from '@mozilla/readability';

/** The tags reader view draws. Anything else is unwrapped, keeping its text. */
export type ReaderTag =
  | 'p'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'ul'
  | 'ol'
  | 'li'
  | 'blockquote'
  | 'pre'
  | 'code'
  | 'em'
  | 'strong'
  | 'a'
  | 'br'
  | 'figcaption';

export type ReaderNode =
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'element'; tag: ReaderTag; href: string | null; children: ReaderNode[] };

export interface Article {
  title: string;
  byline: string | null;
  siteName: string | null;
  minutes: number;
  body: ReaderNode[];
}

const KEPT_TAGS: Record<string, ReaderTag> = {
  p: 'p',
  h1: 'h2',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h4',
  h6: 'h4',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  blockquote: 'blockquote',
  pre: 'pre',
  code: 'code',
  em: 'em',
  i: 'em',
  strong: 'strong',
  b: 'strong',
  a: 'a',
  br: 'br',
  figcaption: 'figcaption',
};

// Dropped with everything inside them, since none of it is text someone reads.
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'picture',
  'video',
  'audio',
  'canvas',
  'form',
  'button',
  'input',
  'select',
  'textarea',
]);

const WORDS_PER_MINUTE = 230;
// Fewer words than a short paragraph is a page of links, not something to read.
const MIN_ARTICLE_WORDS = 40;

/** Only a web address survives as a link; anything else is just its text. */
function linkFrom(href: string | null, base: string): string | null {
  if (!href) {
    return null;
  }
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function readerNodesOf(node: Node, base: string): ReaderNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return text ? [{ kind: 'text', text }] : [];
  }
  if (!(node instanceof Element)) {
    return [];
  }
  const name = node.tagName.toLowerCase();
  if (DROPPED_TAGS.has(name)) {
    return [];
  }
  // Kept by address only; the chrome asks for it through the tab's own session, never loads it itself.
  if (name === 'img') {
    const src = linkFrom(node.getAttribute('src'), base);
    return src ? [{ kind: 'image', src, alt: node.getAttribute('alt') ?? '' }] : [];
  }
  const children = [...node.childNodes].flatMap((child) => readerNodesOf(child, base));
  const tag = KEPT_TAGS[name];
  if (!tag) {
    return children;
  }
  return [{ kind: 'element', tag, href: tag === 'a' ? linkFrom(node.getAttribute('href'), base) : null, children }];
}

/** Every image an article names, in order, once each. */
export function imagesIn(nodes: readonly ReaderNode[]): string[] {
  const found = nodes.flatMap((node): string[] => {
    if (node.kind === 'image') {
      return [node.src];
    }
    return node.kind === 'element' ? imagesIn(node.children) : [];
  });
  return [...new Set(found)];
}

/**
 * The article in a page, as plain structure rather than markup.
 *
 * Parsed into a document that runs no script and loads nothing, and then
 * rebuilt from a short list of tags, so none of the page's own markup, styles
 * or handlers reach the chrome that draws it.
 */
export function articleFrom(html: string, url: string): Article | null {
  const page = new DOMParser().parseFromString(html, 'text/html');
  // A parsed document takes the chrome's address as its own, which every relative link would resolve against.
  const base = page.createElement('base');
  base.href = url;
  page.head.prepend(base);
  const parsed = new Readability(page, { charThreshold: 400 }).parse();
  if (!parsed?.content) {
    return null;
  }
  const content = new DOMParser().parseFromString(parsed.content, 'text/html');
  const body = [...content.body.childNodes].flatMap((child) => readerNodesOf(child, url));
  const words = (parsed.textContent ?? '').split(/\s+/).filter(Boolean).length;
  if (words < MIN_ARTICLE_WORDS) {
    return null;
  }
  return {
    title: parsed.title?.trim() || new URL(url).hostname,
    byline: parsed.byline?.trim() || null,
    siteName: parsed.siteName?.trim() || null,
    minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    body,
  };
}
