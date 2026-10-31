// Utils
import {
  anchoredHostOf,
  compileRegexFilter,
  compileUrlFilter,
  requiredLiteralOf,
  tokenOf,
  tokensIn,
} from './url-filter';

// Types
import type { RequestMethod, ResourceType, Rule } from './rule';

/** What a rule is matched against: one request, as the network sees it. */
export interface NetRequest {
  url: string;
  /** Lowercase, as Chromium hands it over. */
  host: string;
  method: RequestMethod;
  resourceType: ResourceType;
  /** The host of the page or frame that asked; null for one the browser started itself, such as a typed address. */
  initiatorHost: string | null;
  /** The tab's id as extensions know it; -1 for a request no tab made. */
  tabId: number;
  /** Not the same site as the page that asked, which is what domainType compares. */
  isThirdParty: boolean;
}

interface CompiledRule {
  rule: Rule;
  pattern: RegExp | null;
  /** Text a regexFilter cannot match without, lowercased unless the rule is case-sensitive; checked first. */
  literal: string | null;
}

/** A domain list names a host when it names it or any domain above it. */
export function isWithin(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function appliesTo(rule: Rule, request: NetRequest): boolean {
  const { condition } = rule;
  const { resourceTypes, excludedResourceTypes } = condition;
  // Chrome's default: a rule that names no types matches everything but the page itself.
  if (resourceTypes) {
    if (!resourceTypes.includes(request.resourceType)) {
      return false;
    }
  } else if (excludedResourceTypes) {
    if (excludedResourceTypes.includes(request.resourceType)) {
      return false;
    }
  } else if (request.resourceType === 'main_frame') {
    return false;
  }
  if (condition.requestMethods && !condition.requestMethods.includes(request.method)) {
    return false;
  }
  if (condition.excludedRequestMethods?.includes(request.method)) {
    return false;
  }
  if (condition.requestDomains && !isWithin(request.host, condition.requestDomains)) {
    return false;
  }
  if (condition.excludedRequestDomains && isWithin(request.host, condition.excludedRequestDomains)) {
    return false;
  }
  if (
    condition.initiatorDomains &&
    (request.initiatorHost === null || !isWithin(request.initiatorHost, condition.initiatorDomains))
  ) {
    return false;
  }
  if (
    condition.excludedInitiatorDomains &&
    request.initiatorHost !== null &&
    isWithin(request.initiatorHost, condition.excludedInitiatorDomains)
  ) {
    return false;
  }
  if (condition.domainType === 'firstParty' && request.isThirdParty) {
    return false;
  }
  if (condition.domainType === 'thirdParty' && !request.isThirdParty) {
    return false;
  }
  if (condition.tabIds && !condition.tabIds.includes(request.tabId)) {
    return false;
  }
  if (condition.excludedTabIds?.includes(request.tabId)) {
    return false;
  }
  return true;
}

/** A rule's pattern, or null for one without; undefined when its regexFilter will not compile. */
function patternOf(rule: Rule): RegExp | null | undefined {
  const { urlFilter, regexFilter, isUrlFilterCaseSensitive } = rule.condition;
  if (regexFilter !== undefined) {
    return compileRegexFilter(regexFilter, isUrlFilterCaseSensitive) ?? undefined;
  }
  return urlFilter === undefined ? null : compileUrlFilter(urlFilter, isUrlFilterCaseSensitive);
}

function file<Key>(map: Map<Key, CompiledRule[]>, key: Key, compiled: CompiledRule): void {
  const filed = map.get(key);
  if (filed) {
    filed.push(compiled);
  } else {
    map.set(key, [compiled]);
  }
}

/** What a request is looked up by, worked out once for every index it is checked against. */
export interface RequestKeys {
  /** Its host and every name above it. */
  hosts: string[];
  tokens: Set<string>;
}

export function keysOf(request: NetRequest): RequestKeys {
  const labels = request.host.split('.');
  return {
    hosts: labels.map((_label, index) => labels.slice(index).join('.')),
    tokens: tokensIn(request.url),
  };
}

/**
 * A set of rules filed so that a request is checked against only the few that
 * could match it: by the domains it names, the host its pattern is anchored
 * at, or a word its pattern cannot match without.
 */
export class RuleIndex {
  private readonly byHost = new Map<string, CompiledRule[]>();
  private readonly byToken = new Map<string, CompiledRule[]>();
  private readonly everywhere: CompiledRule[] = [];
  private readonly patterns = new Map<Rule, RegExp | null>();
  /** Whether any rule changes headers, so a request's headers are read only for an index that might. */
  readonly hasHeaderRules: boolean;

  /** How many rules it holds, leaving out any whose regexFilter was refused. */
  get size(): number {
    return this.patterns.size;
  }

  constructor(rules: readonly Rule[]) {
    this.hasHeaderRules = rules.some((rule) => rule.action.type === 'modifyHeaders');
    for (const rule of rules) {
      const { urlFilter, requestDomains } = rule.condition;
      const pattern = patternOf(rule);
      if (pattern === undefined) {
        continue;
      }
      this.patterns.set(rule, pattern);
      const { regexFilter, isUrlFilterCaseSensitive } = rule.condition;
      const literal = regexFilter === undefined ? null : requiredLiteralOf(regexFilter);
      const compiled = {
        rule,
        pattern,
        literal: literal !== null && isUrlFilterCaseSensitive !== true ? literal.toLowerCase() : literal,
      };
      if (requestDomains) {
        requestDomains.forEach((domain) => file(this.byHost, domain, compiled));
        continue;
      }
      const host = urlFilter ? anchoredHostOf(urlFilter) : null;
      const token = host === null && urlFilter ? tokenOf(urlFilter) : null;
      if (host !== null) {
        file(this.byHost, host, compiled);
      } else if (token !== null) {
        file(this.byToken, token, compiled);
      } else {
        this.everywhere.push(compiled);
      }
    }
  }

  /** Every rule that matches the request, in no particular order. */
  matching(request: NetRequest, keys: RequestKeys = keysOf(request)): Rule[] {
    if (this.patterns.size === 0) {
      return [];
    }
    // A rule naming several domains is filed under each, so one found twice is kept once.
    const filed = new Set<CompiledRule>();
    keys.hosts.forEach((host) => this.byHost.get(host)?.forEach((compiled) => filed.add(compiled)));
    keys.tokens.forEach((token) => this.byToken.get(token)?.forEach((compiled) => filed.add(compiled)));
    // Lowercased once, and only if a rule has text to look for in it.
    let lowercaseUrl: string | null = null;
    const hasLiteral = (compiled: CompiledRule) => {
      if (compiled.literal === null) {
        return true;
      }
      if (compiled.rule.condition.isUrlFilterCaseSensitive === true) {
        return request.url.includes(compiled.literal);
      }
      lowercaseUrl ??= request.url.toLowerCase();
      return lowercaseUrl.includes(compiled.literal);
    };
    return [...this.everywhere, ...filed]
      .filter(
        (compiled) =>
          hasLiteral(compiled) &&
          (compiled.pattern === null || compiled.pattern.test(request.url)) &&
          appliesTo(compiled.rule, request),
      )
      .map((compiled) => compiled.rule);
  }

  /** The pattern a rule matched with, for a redirect that substitutes what its regexFilter captured. */
  patternFor(rule: Rule): RegExp | null {
    return this.patterns.get(rule) ?? null;
  }
}
