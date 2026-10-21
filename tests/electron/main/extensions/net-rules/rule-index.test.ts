import { describe, expect, it } from 'vitest';
import { RuleIndex, isWithin, type NetRequest } from '../../../../../electron/main/extensions/net-rules/rule-index';
import type { Rule } from '../../../../../electron/main/extensions/net-rules/rule';

const rule = (id: number, condition: Rule['condition'], type: Rule['action']['type'] = 'block'): Rule => ({
  id,
  priority: 1,
  action: { type },
  condition,
});

const request = (overrides: Partial<NetRequest> = {}): NetRequest => ({
  url: 'https://ads.tracker.example/pixel.gif',
  host: 'ads.tracker.example',
  method: 'get',
  resourceType: 'image',
  initiatorHost: 'news.example.org',
  tabId: 7,
  isThirdParty: true,
  ...overrides,
});

const matchedIds = (rules: Rule[], overrides: Partial<NetRequest> = {}) =>
  new RuleIndex(rules).matching(request(overrides)).map((matched) => matched.id);

describe('which rules match a request', () => {
  it('finds rules filed by host, by token and everywhere', () => {
    const rules = [
      rule(1, { urlFilter: '||tracker.example^' }),
      rule(2, { urlFilter: '/pixel.gif|' }),
      rule(3, { urlFilter: 'pixel' }),
      rule(4, { requestDomains: ['tracker.example'] }),
      rule(5, { urlFilter: '||unrelated.example^' }),
    ];
    expect(matchedIds(rules).sort()).toEqual([1, 2, 3, 4]);
  });

  // Chrome's default, and the one that keeps an ad blocker from blocking the page you asked for.
  it('never applies a rule that names no types to the page itself', () => {
    const rules = [rule(1, { urlFilter: '||news.example.org^' })];
    expect(
      matchedIds(rules, { url: 'https://news.example.org/', host: 'news.example.org', resourceType: 'main_frame' }),
    ).toEqual([]);
    expect(
      matchedIds(rules, { url: 'https://news.example.org/a.js', host: 'news.example.org', resourceType: 'script' }),
    ).toEqual([1]);
  });

  it.each<[string, Rule['condition'], boolean]>([
    ['its type', { resourceTypes: ['script'] }, false],
    ['its type, when the type is the one excluded', { excludedResourceTypes: ['image'] }, false],
    ['its method', { requestMethods: ['post'] }, false],
    ['its domain, below a listed one', { requestDomains: ['tracker.example'] }, true],
    ['its domain, when that is excluded', { excludedRequestDomains: ['ads.tracker.example'] }, false],
    ['the page that asked', { initiatorDomains: ['example.org'] }, true],
    ['the page that asked, when excluded', { excludedInitiatorDomains: ['news.example.org'] }, false],
    ['being first-party', { domainType: 'firstParty' }, false],
    ['being third-party', { domainType: 'thirdParty' }, true],
    ['its tab', { tabIds: [8] }, false],
    ['its tab, when excluded', { excludedTabIds: [7] }, false],
  ])('checks %s', (_name, condition, isMatch) => {
    expect(matchedIds([rule(1, condition)]).length > 0).toBe(isMatch);
  });

  // A typed address or a bookmark has no page that asked for it, so a rule about askers cannot be about it.
  it('does not match an asker rule to a request the browser made itself', () => {
    expect(matchedIds([rule(1, { initiatorDomains: ['example.org'] })], { initiatorHost: null })).toEqual([]);
    expect(matchedIds([rule(1, { excludedInitiatorDomains: ['example.org'] })], { initiatorHost: null })).toEqual([
      1,
    ]);
  });

  // "/ads" matches "/adserver" too, so it cannot be filed under the whole word and missed.
  it('still finds a rule whose pattern runs into a longer word', () => {
    expect(
      matchedIds([rule(1, { urlFilter: '/ads' })], { url: 'https://x.example/adserver/1.js', host: 'x.example' }),
    ).toEqual([1]);
  });

  it('refuses a regexFilter it cannot compile, and matches one it can', () => {
    const index = new RuleIndex([rule(1, { regexFilter: '(broken' }), rule(2, { regexFilter: 'pixel\\.gif$' })]);
    expect(index.size).toBe(1);
    expect(index.matching(request()).map((matched) => matched.id)).toEqual([2]);
  });
});

describe('a domain list', () => {
  it.each([
    ['example.com', ['example.com'], true],
    ['a.b.example.com', ['example.com'], true],
    ['badexample.com', ['example.com'], false],
    ['example.com', ['a.example.com'], false],
  ])('%s is within %j: %s', (host, domains, expected) => {
    expect(isWithin(host, domains)).toBe(expected);
  });
});
