import { describe, expect, it } from 'vitest';
import {
  buildSearchUrl,
  engineFor,
  keywordSearchFor,
  problemWithEngine,
  readCustomSearchEngines,
  type SearchSetup,
} from '../../../../electron/shared/browsing/search-engines';
import { resolveOmniboxInput } from '../../../../electron/shared/browsing/url';

const WIKIPEDIA = {
  id: 'custom-wikipedia1',
  name: 'Wikipedia',
  keyword: 'w',
  searchTemplate: 'https://en.wikipedia.org/w/index.php?search=%s',
} as const;
const WITH_WIKIPEDIA: SearchSetup = { searchEngine: 'brave', customSearchEngines: [WIKIPEDIA] };

describe('a keyword and a space', () => {
  it('searches with that engine', () => {
    expect(keywordSearchFor('w hedgehogs', WITH_WIKIPEDIA)?.target).toBe(
      'https://en.wikipedia.org/w/index.php?search=hedgehogs',
    );
    expect(resolveOmniboxInput('w hedgehog care', WITH_WIKIPEDIA)).toEqual({
      type: 'search',
      target: 'https://en.wikipedia.org/w/index.php?search=hedgehog%20care',
      query: 'hedgehog care',
    });
  });

  // A word that is not a keyword is only the start of a search, and an address stays an address.
  it('leaves everything else alone', () => {
    expect(keywordSearchFor('wikipedia hedgehogs', WITH_WIKIPEDIA)).toBeNull();
    expect(keywordSearchFor('w', WITH_WIKIPEDIA)).toBeNull();
    expect(resolveOmniboxInput('example.com', WITH_WIKIPEDIA)?.type).toBe('url');
  });
});

describe('the default engine', () => {
  it('can be one someone added', () => {
    const setup: SearchSetup = { searchEngine: WIKIPEDIA.id, customSearchEngines: [WIKIPEDIA] };
    expect(buildSearchUrl('otters', setup)).toBe('https://en.wikipedia.org/w/index.php?search=otters');
  });

  // Deleted since it was chosen: searching still goes somewhere rather than nowhere.
  it('falls back when the chosen one is gone', () => {
    expect(engineFor({ searchEngine: WIKIPEDIA.id, customSearchEngines: [] }).name).toBe('DuckDuckGo');
  });
});

describe('what can be added', () => {
  it('needs a name, a one-word keyword not already used, and an address with %s', () => {
    const base = { name: 'Maps', keyword: 'm', searchTemplate: 'https://maps.example/?q=%s' };
    expect(problemWithEngine(base, [WIKIPEDIA])).toBeNull();
    expect(problemWithEngine({ ...base, name: ' ' }, [])).toBe('name');
    expect(problemWithEngine({ ...base, keyword: 'two words' }, [])).toBe('keyword');
    expect(problemWithEngine({ ...base, keyword: 'W' }, [WIKIPEDIA])).toBe('keywordTaken');
    expect(problemWithEngine({ ...base, searchTemplate: 'https://maps.example/' }, [])).toBe('template');
    expect(problemWithEngine({ ...base, searchTemplate: 'javascript:alert(%s)' }, [])).toBe('template');
  });

  it('drops what would not survive being added, read from disk or a renderer', () => {
    const read = readCustomSearchEngines([
      WIKIPEDIA,
      { ...WIKIPEDIA, id: 'custom-duplicate1' },
      { id: 'not-an-id', name: 'X', keyword: 'x', searchTemplate: 'https://x.example/?q=%s' },
      'nonsense',
    ]);
    expect(read).toEqual([WIKIPEDIA]);
    expect(readCustomSearchEngines('nonsense')).toBeNull();
  });
});
