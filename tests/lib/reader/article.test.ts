import { describe, expect, it } from 'vitest';
import { articleFrom, type ReaderNode } from '@/lib/reader/article';

const paragraph = (text: string) => `<p>${text}</p>`;
const story = Array.from({ length: 12 }, (_unused, index) =>
  paragraph(`Paragraph ${index} of a long story about browsers, written to be read rather than skimmed by anyone.`),
).join('');

const page = (body: string) => `<!doctype html><html><head><title>A long story</title></head>
  <body><nav><a href="/">Home</a></nav><article><h1>A long story</h1>${body}</article><footer>Footer</footer></body></html>`;

const tagsIn = (nodes: readonly ReaderNode[]): string[] =>
  nodes.flatMap((node) => (node.kind === 'element' ? [node.tag, ...tagsIn(node.children)] : []));
const textOf = (nodes: readonly ReaderNode[]): string =>
  nodes.map((node) => (node.kind === 'text' ? node.text : textOf(node.children))).join('');

describe('articleFrom', () => {
  it('finds the article and leaves the page around it', () => {
    const article = articleFrom(page(story), 'https://news.example/story');
    expect(article?.title).toBe('A long story');
    expect(textOf(article?.body ?? [])).toContain('Paragraph 11');
    expect(textOf(article?.body ?? [])).not.toContain('Footer');
    expect(article?.minutes).toBeGreaterThanOrEqual(1);
  });

  it('keeps nothing of the page that could run or load', () => {
    const hostile = `${story}<p>Read <a href="javascript:alert(1)">this</a> and <a href="/next" onclick="steal()">next</a>.</p>
      <script>steal()</script><img src="https://tracker.example/pixel.gif" onerror="steal()"><iframe src="https://ads.example"></iframe>`;
    const article = articleFrom(page(hostile), 'https://news.example/story');
    const tags = tagsIn(article?.body ?? []);
    expect(tags).not.toContain('script');
    expect(tags).not.toContain('img');
    expect(tags).not.toContain('iframe');
    const links = (function collect(nodes: readonly ReaderNode[]): (string | null)[] {
      return nodes.flatMap((node) =>
        node.kind === 'element' ? [...(node.tag === 'a' ? [node.href] : []), ...collect(node.children)] : [],
      );
    })(article?.body ?? []);
    // A relative link is made whole against the page, not against the chrome that reads it.
    expect(links).toContain('https://news.example/next');
    expect(links.some((link) => link?.startsWith('javascript:'))).toBe(false);
  });

  it('says there is no article when a page has no body of text', () => {
    expect(articleFrom('<html><body><a href="/">Home</a></body></html>', 'https://example.com/')).toBeNull();
  });
});
