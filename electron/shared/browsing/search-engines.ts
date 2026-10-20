// Types
import type {
  CustomSearchEngine,
  CustomSearchEngineId,
  SearchEngine,
  SearchEngineChoice,
  SearchEngineId,
} from '../types';

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngine> = {
  duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', searchTemplate: 'https://duckduckgo.com/?q=%s' },
  google: { id: 'google', name: 'Google', searchTemplate: 'https://www.google.com/search?q=%s' },
  brave: { id: 'brave', name: 'Brave Search', searchTemplate: 'https://search.brave.com/search?q=%s' },
  startpage: { id: 'startpage', name: 'Startpage', searchTemplate: 'https://www.startpage.com/sp/search?query=%s' },
  bing: { id: 'bing', name: 'Bing', searchTemplate: 'https://www.bing.com/search?q=%s' },
};

export const SEARCH_ENGINE_OPTIONS: readonly SearchEngine[] = Object.values(SEARCH_ENGINES);

export const MAX_CUSTOM_SEARCH_ENGINES = 20;
export const MAX_ENGINE_NAME = 40;
export const MAX_ENGINE_KEYWORD = 20;
const MAX_TEMPLATE = 2048;
const CUSTOM_ID = /^custom-[0-9a-z]{6,36}$/;

/** What every search needs to know: which engine is the default, and which have keywords. */
export interface SearchSetup {
  searchEngine: SearchEngineChoice;
  customSearchEngines: readonly CustomSearchEngine[];
}

/** For reading an address, where only whether it is one matters: no keyword can turn it into a search. */
export const WITHOUT_KEYWORDS: SearchSetup = { searchEngine: 'duckduckgo', customSearchEngines: [] };

export function isBuiltInEngine(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && Object.hasOwn(SEARCH_ENGINES, value);
}

export function isCustomEngineId(value: unknown): value is CustomSearchEngineId {
  return typeof value === 'string' && CUSTOM_ID.test(value);
}

/** The default engine; one deleted since it was chosen falls back to DuckDuckGo rather than searching nowhere. */
export function engineFor(search: SearchSetup): { name: string; searchTemplate: string } {
  if (isBuiltInEngine(search.searchEngine)) {
    return SEARCH_ENGINES[search.searchEngine];
  }
  return search.customSearchEngines.find((engine) => engine.id === search.searchEngine) ?? SEARCH_ENGINES.duckduckgo;
}

function fill(template: string, query: string): string {
  return template.replaceAll('%s', encodeURIComponent(query));
}

export function buildSearchUrl(query: string, search: SearchSetup): string {
  return fill(engineFor(search).searchTemplate, query);
}

/** A keyword, a space and a query, searched with that engine; anything else is null. */
export function keywordSearchFor(
  input: string,
  search: SearchSetup,
): { target: string; query: string; engineName: string } | null {
  const match = /^(\S+)\s+(\S.*)$/.exec(input.trim());
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const keyword = match[1].toLowerCase();
  const engine = search.customSearchEngines.find((candidate) => candidate.keyword === keyword);
  return engine ? { target: fill(engine.searchTemplate, match[2]), query: match[2], engineName: engine.name } : null;
}

/** Why a typed engine cannot be saved, or null when it can. */
export type EngineProblem = 'name' | 'keyword' | 'keywordTaken' | 'template';

export function problemWithEngine(
  engine: { name: string; keyword: string; searchTemplate: string },
  others: readonly CustomSearchEngine[],
): EngineProblem | null {
  const name = engine.name.trim();
  if (!name || name.length > MAX_ENGINE_NAME) {
    return 'name';
  }
  const keyword = engine.keyword.trim().toLowerCase();
  if (!keyword || keyword.length > MAX_ENGINE_KEYWORD || /\s/.test(keyword)) {
    return 'keyword';
  }
  if (others.some((other) => other.keyword === keyword)) {
    return 'keywordTaken';
  }
  return isSearchTemplate(engine.searchTemplate.trim()) ? null : 'template';
}

/** A web address with %s where the query goes, and nothing a page could not be sent to. */
export function isSearchTemplate(template: string): boolean {
  if (template.length > MAX_TEMPLATE || !template.includes('%s')) {
    return false;
  }
  try {
    const protocol = new URL(template.replaceAll('%s', 'query')).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Read from a renderer or from disk, so each engine is checked as if it were being added. */
export function readCustomSearchEngines(raw: unknown): CustomSearchEngine[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const engines: CustomSearchEngine[] = [];
  for (const candidate of raw.slice(0, MAX_CUSTOM_SEARCH_ENGINES)) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }
    const { id, name, keyword, searchTemplate } = candidate as Record<string, unknown>;
    if (!isCustomEngineId(id) || typeof name !== 'string' || typeof keyword !== 'string') {
      continue;
    }
    if (typeof searchTemplate !== 'string' || engines.some((engine) => engine.id === id)) {
      continue;
    }
    if (problemWithEngine({ name, keyword, searchTemplate }, engines) !== null) {
      continue;
    }
    engines.push({
      id,
      name: name.trim(),
      keyword: keyword.trim().toLowerCase(),
      searchTemplate: searchTemplate.trim(),
    });
  }
  return engines;
}
