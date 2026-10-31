/** The tags reader view draws. Anything else is unwrapped, keeping its text. */
export const READER_TAGS = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'a',
  'br',
  'figcaption',
] as const;

export type ReaderTag = (typeof READER_TAGS)[number];

export type ReaderNode =
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'element'; tag: ReaderTag; href: string | null; children: ReaderNode[] };

export interface Article {
  title: string;
  /** The language the page says it is in, as the translation list names it, when it says. */
  language: string | null;
  byline: string | null;
  siteName: string | null;
  minutes: number;
  body: ReaderNode[];
}

// Bounds an article from the renderer or a file must keep: deep enough for any real page, far short of a hostile one.
const DEEPEST = 40;
const MOST_NODES = 60_000;
const MOST_TEXT = 4_000_000;

const isReaderTag = (value: unknown): value is ReaderTag => READER_TAGS.some((tag) => tag === value);
const isWebAddress = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\//.test(value);
const textOrNull = (value: unknown) => (typeof value === 'string' && value ? value.slice(0, 500) : null);

/**
 * An article as reader view made it, rebuilt from what came over IPC or off
 * disk: only the node kinds and tags it draws, only web addresses for links
 * and images, and within bounds. Anything else makes the whole article null.
 */
export function readArticle(value: unknown): Article | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  let nodes = 0;
  let text = 0;
  const readNodes = (raw: unknown, depth: number): ReaderNode[] | null => {
    if (!Array.isArray(raw) || depth > DEEPEST) {
      return null;
    }
    const read: ReaderNode[] = [];
    for (const item of raw) {
      nodes += 1;
      const node = readNode(item, depth);
      if (!node || nodes > MOST_NODES || text > MOST_TEXT) {
        return null;
      }
      read.push(node);
    }
    return read;
  };
  const readNode = (raw: unknown, depth: number): ReaderNode | null => {
    const kind: unknown = Reflect.get(Object(raw), 'kind');
    if (kind === 'text') {
      const body: unknown = Reflect.get(Object(raw), 'text');
      text += typeof body === 'string' ? body.length : 0;
      return typeof body === 'string' ? { kind: 'text', text: body } : null;
    }
    if (kind === 'image') {
      const src: unknown = Reflect.get(Object(raw), 'src');
      const alt: unknown = Reflect.get(Object(raw), 'alt');
      return isWebAddress(src) ? { kind: 'image', src, alt: typeof alt === 'string' ? alt : '' } : null;
    }
    const tag: unknown = Reflect.get(Object(raw), 'tag');
    const href: unknown = Reflect.get(Object(raw), 'href');
    const children = readNodes(Reflect.get(Object(raw), 'children'), depth + 1);
    return kind === 'element' && isReaderTag(tag) && children
      ? { kind: 'element', tag, href: isWebAddress(href) ? href : null, children }
      : null;
  };
  const body = readNodes(Reflect.get(value, 'body'), 0);
  const title: unknown = Reflect.get(value, 'title');
  const minutes: unknown = Reflect.get(value, 'minutes');
  if (!body || typeof title !== 'string') {
    return null;
  }
  return {
    title: title.slice(0, 500),
    language: textOrNull(Reflect.get(value, 'language')),
    byline: textOrNull(Reflect.get(value, 'byline')),
    siteName: textOrNull(Reflect.get(value, 'siteName')),
    minutes: typeof minutes === 'number' && Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0,
    body,
  };
}
