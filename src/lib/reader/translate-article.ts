// Utils
import { readerNodesFromHtml, type ReaderNode, type ReaderTag } from '@/lib/reader/article';

type ElementNode = Extract<ReaderNode, { kind: 'element' }>;

// A block whose words are translated together, so a sentence keeps its own grammar.
const TEXT_BLOCKS = new Set<ReaderTag>(['p', 'h2', 'h3', 'h4', 'li', 'blockquote', 'figcaption']);
const INLINE = new Set<ReaderTag>(['em', 'strong', 'a', 'code', 'br']);

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (text: string) => escapeHtml(text).replace(/"/g, '&quot;');

function isInlineOnly(nodes: readonly ReaderNode[]): boolean {
  return nodes.every(
    (node) =>
      node.kind === 'text' || (node.kind === 'element' && INLINE.has(node.tag) && isInlineOnly(node.children)),
  );
}

function isTextBlock(node: ElementNode): boolean {
  return TEXT_BLOCKS.has(node.tag) && node.children.length > 0 && isInlineOnly(node.children);
}

function htmlOf(nodes: readonly ReaderNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') {
        return escapeHtml(node.text);
      }
      if (node.kind === 'image') {
        return '';
      }
      if (node.tag === 'br') {
        return '<br>';
      }
      const href = node.tag === 'a' && node.href ? ` href="${escapeAttribute(node.href)}"` : '';
      return `<${node.tag}${href}>${htmlOf(node.children)}</${node.tag}>`;
    })
    .join('');
}

/** The markup of every text block, in the order they are read, for the engine to translate. */
export function blocksToTranslate(nodes: readonly ReaderNode[]): string[] {
  return nodes.flatMap((node): string[] => {
    if (node.kind !== 'element') {
      return [];
    }
    return isTextBlock(node) ? [htmlOf(node.children)] : blocksToTranslate(node.children);
  });
}

/** The article again with each text block's words replaced, in the same order they were taken. */
export function withTranslations(
  nodes: readonly ReaderNode[],
  translated: readonly string[],
  base: string,
): ReaderNode[] {
  let next = 0;
  const rebuild = (list: readonly ReaderNode[]): ReaderNode[] =>
    list.map((node) => {
      if (node.kind !== 'element') {
        return node;
      }
      if (!isTextBlock(node)) {
        return { ...node, children: rebuild(node.children) };
      }
      const html = translated[next];
      next += 1;
      // Rebuilt under the article's own rules, so the engine's markup is held to them as the page's was.
      return html === undefined ? node : { ...node, children: readerNodesFromHtml(html, base) };
    });
  return rebuild(nodes);
}
