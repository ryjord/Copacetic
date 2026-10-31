import { describe, expect, it } from 'vitest';
import { readArticle } from '../../../../electron/shared/reader/article';

const ARTICLE = {
  title: 'A long read',
  language: 'en',
  byline: 'Riley',
  siteName: 'Example',
  minutes: 6,
  body: [
    { kind: 'element', tag: 'p', href: null, children: [{ kind: 'text', text: 'Hello' }] },
    { kind: 'element', tag: 'a', href: 'https://example.com/more', children: [{ kind: 'text', text: 'more' }] },
    { kind: 'image', src: 'https://example.com/a.png', alt: 'A picture' },
  ],
};

/** A saved article comes from the renderer and off disk, so only what reader view draws gets back in. */
describe('reading back a saved article', () => {
  it('keeps an article reader view made, as it was', () => {
    expect(readArticle(ARTICLE)).toEqual(ARTICLE);
  });

  it('refuses a tag reader view never draws, such as a script', () => {
    const withScript = { ...ARTICLE, body: [{ kind: 'element', tag: 'script', href: null, children: [] }] };
    expect(readArticle(withScript)).toBeNull();
  });

  // A link or picture that is not a web address is just text, so javascript: and data: never get back in.
  it('drops a link that is not a web address, and refuses such a picture', () => {
    const scripted = {
      ...ARTICLE,
      body: [{ kind: 'element', tag: 'a', href: 'javascript:alert(1)', children: [{ kind: 'text', text: 'x' }] }],
    };
    expect(readArticle(scripted)?.body[0]).toMatchObject({ href: null });
    expect(
      readArticle({ ...ARTICLE, body: [{ kind: 'image', src: 'data:image/png;base64,AA', alt: '' }] }),
    ).toBeNull();
  });

  it('refuses one nested far deeper than any page', () => {
    let body: unknown = [{ kind: 'text', text: 'deep' }];
    for (let level = 0; level < 60; level += 1) {
      body = [{ kind: 'element', tag: 'blockquote', href: null, children: body }];
    }
    expect(readArticle({ ...ARTICLE, body })).toBeNull();
  });

  it('refuses what is not an article at all', () => {
    expect(readArticle(null)).toBeNull();
    expect(readArticle({ title: 3, body: [] })).toBeNull();
  });
});
