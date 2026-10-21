import { describe, expect, it } from 'vitest';
import { readRule } from '../../../../../electron/main/extensions/net-rules/rule';

const block = (condition: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 1,
  action: { type: 'block' },
  condition,
  ...extra,
});

describe('a rule an extension wrote', () => {
  it('is read with Chrome’s default priority', () => {
    expect(readRule(block({ urlFilter: '/ads/' }))).toEqual({
      rule: { id: 1, priority: 1, action: { type: 'block' }, condition: { urlFilter: '/ads/' } },
    });
  });

  // Untrusted input: a rule Chrome would refuse is refused whole, never applied in part.
  it.each([
    ['no id', { action: { type: 'block' } }],
    ['a zero id', block({}, { id: 0 })],
    ['a priority below one', block({}, { priority: 0 })],
    ['an action Chrome does not have', { id: 1, action: { type: 'explode' }, condition: {} }],
    ['a redirect to nowhere', { id: 1, action: { type: 'redirect' }, condition: {} }],
    ['a header rule that changes no header', { id: 1, action: { type: 'modifyHeaders' }, condition: {} }],
    ['both kinds of filter', block({ urlFilter: 'a', regexFilter: 'b' })],
    ['an uppercase domain', block({ requestDomains: ['Example.com'] })],
    ['a domain with a scheme', block({ initiatorDomains: ['https://example.com'] })],
    ['an empty domain list', block({ requestDomains: [] })],
    ['a resource type Chrome does not have', block({ resourceTypes: ['image', 'hologram'] })],
    ['allow-everything not about a page or frame', { id: 1, action: { type: 'allowAllRequests' }, condition: {} }],
  ])('is refused with %s', (_name, value) => {
    expect('problem' in readRule(value)).toBe(true);
  });

  it('keeps the parts of a redirect it can use', () => {
    const reading = readRule({
      id: 2,
      action: { type: 'redirect', redirect: { extensionPath: '/surrogates/ga.js' } },
      condition: { urlFilter: '||google-analytics.com/analytics.js' },
    });
    expect(reading).toEqual({
      rule: {
        id: 2,
        priority: 1,
        action: { type: 'redirect', redirect: { extensionPath: '/surrogates/ga.js' } },
        condition: { urlFilter: '||google-analytics.com/analytics.js' },
      },
    });
  });

  it('reads the header changes Chrome accepts', () => {
    const reading = readRule({
      id: 3,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'remove' }] },
      condition: {},
    });
    expect('rule' in reading && reading.rule.action.requestHeaders).toEqual([
      { header: 'referer', operation: 'remove' },
    ]);
  });

  it('accepts allow-everything for a page', () => {
    expect(
      'rule' in
        readRule({ id: 4, action: { type: 'allowAllRequests' }, condition: { resourceTypes: ['main_frame'] } }),
    ).toBe(true);
  });
});
