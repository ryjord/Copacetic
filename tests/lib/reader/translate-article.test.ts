import { describe, expect, it } from 'vitest';
import { blocksToTranslate, withTranslations } from '@/lib/reader/translate-article';
import type { ReaderNode } from '@/lib/reader/article';

const text = (value: string): ReaderNode => ({ kind: 'text', text: value });
const element = (
  tag: 'p' | 'li' | 'ul' | 'a' | 'em',
  children: ReaderNode[],
  href: string | null = null,
): ReaderNode => ({
  kind: 'element',
  tag,
  href,
  children,
});

const body: ReaderNode[] = [
  element('p', [text('Read '), element('a', [text('this')], 'https://news.example/next'), text(' & that.')]),
  element('ul', [element('li', [element('em', [text('One')])]), element('li', [text('Two')])]),
];

describe('translating an article', () => {
  it('hands the engine each text block, its markup escaped', () => {
    expect(blocksToTranslate(body)).toEqual([
      'Read <a href="https://news.example/next">this</a> &amp; that.',
      '<em>One</em>',
      'Two',
    ]);
  });

  it('puts the translation back in the same places, under the article rules', () => {
    const translated = withTranslations(
      body,
      ['Lies <a href="javascript:steal()">dies</a> und das.', '<em>Eins</em>', '<script>steal()</script>Zwei'],
      'https://news.example/story',
    );
    expect(blocksToTranslate(translated)).toEqual(['Lies <a>dies</a> und das.', '<em>Eins</em>', 'Zwei']);
  });
});
