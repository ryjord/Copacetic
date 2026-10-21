import { describe, expect, it } from 'vitest';
import {
  applyHeaderChanges,
  combineVerdicts,
  headerRules,
  redirectTarget,
  winningRule,
} from '../../../../../electron/main/extensions/net-rules/outcome';
import type { Rule, RuleAction } from '../../../../../electron/main/extensions/net-rules/rule';

const rule = (id: number, priority: number, action: RuleAction): Rule => ({ id, priority, action, condition: {} });
const EXTENSION = 'a'.repeat(32);

describe('the rule that decides a request', () => {
  it('is the one with the highest priority', () => {
    const rules = [rule(1, 1, { type: 'block' }), rule(2, 5, { type: 'allow' })];
    expect(winningRule(rules, 'https://example.com/')?.id).toBe(2);
  });

  // Chrome's tie order: allow, allow everything, block, upgrade, redirect.
  it.each([
    [['block', 'allow'], 'allow'],
    [['redirect', 'block'], 'block'],
    [['redirect', 'upgradeScheme'], 'upgradeScheme'],
    [['block', 'allowAllRequests'], 'allowAllRequests'],
  ] as const)('among %j at one priority is %s', (types, expected) => {
    const rules = types.map((type, index) => rule(index + 1, 1, { type, redirect: { url: 'https://x.example/' } }));
    expect(winningRule(rules, 'http://example.com/')?.action.type).toBe(expected);
  });

  it('never upgrades an address that is already secure', () => {
    expect(winningRule([rule(1, 1, { type: 'upgradeScheme' })], 'https://example.com/')).toBeNull();
  });

  it('is never a header rule', () => {
    expect(
      winningRule([rule(1, 9, { type: 'modifyHeaders', requestHeaders: [] })], 'https://example.com/'),
    ).toBeNull();
  });
});

describe('the header rules that still apply', () => {
  const headers = rule(3, 2, { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'remove' }] });

  it.each([
    ['nothing else matched', null, true],
    ['a lower allow won', rule(1, 1, { type: 'allow' }), true],
    ['a higher allow won', rule(1, 5, { type: 'allow' }), false],
    ['a block won', rule(1, 1, { type: 'block' }), false],
  ])('when %s: %s', (_name, winner, applies) => {
    expect(headerRules([headers, ...(winner ? [winner] : [])], winner).length > 0).toBe(applies);
  });

  // The higher rule has the last word on a header; appends add up.
  it('lets a higher rule decide a header, and adds appends together', () => {
    const rules = [
      rule(1, 3, { type: 'modifyHeaders', requestHeaders: [{ header: 'x-one', operation: 'set', value: 'high' }] }),
      rule(2, 2, { type: 'modifyHeaders', requestHeaders: [{ header: 'X-One', operation: 'remove' }] }),
      rule(3, 2, { type: 'modifyHeaders', requestHeaders: [{ header: 'x-two', operation: 'append', value: 'b' }] }),
    ];
    const changed = applyHeaderChanges(
      { 'X-One': 'original', 'x-two': 'a' },
      rules,
      (each) => each.action.requestHeaders,
    );
    expect(changed).toEqual({ 'X-One': 'high', 'x-two': 'a, b' });
  });
});

describe('where a redirect sends a request', () => {
  it.each([
    ['to an address', { url: 'https://safe.example/' }, 'https://safe.example/'],
    [
      'to a page of its own',
      { extensionPath: '/surrogates/ga.js' },
      `chrome-extension://${EXTENSION}/surrogates/ga.js`,
    ],
    [
      'by taking a parameter away',
      { transform: { queryTransform: { removeParams: ['utm_source'] } } },
      'https://shop.example/item?id=4',
    ],
    [
      'to another host',
      { transform: { host: 'mirror.example' } },
      'https://mirror.example/item?id=4&utm_source=mail',
    ],
  ])('%s', (_name, redirect, expected) => {
    expect(
      redirectTarget(
        rule(1, 1, { type: 'redirect', redirect }),
        'https://shop.example/item?id=4&utm_source=mail',
        null,
        EXTENSION,
      ),
    ).toBe(expected);
  });

  it('substitutes what a regexFilter captured', () => {
    const pattern = /^https:\/\/out\.example\/\?to=(.*)$/;
    const redirect = rule(1, 1, { type: 'redirect', redirect: { regexSubstitution: 'https://\\1' } });
    expect(redirectTarget(redirect, 'https://out.example/?to=news.example/a', pattern, EXTENSION)).toBe(
      'https://news.example/a',
    );
  });

  it('upgrades http to https and ws to wss', () => {
    expect(redirectTarget(rule(1, 1, { type: 'upgradeScheme' }), 'http://example.com/a', null, EXTENSION)).toBe(
      'https://example.com/a',
    );
    expect(redirectTarget(rule(1, 1, { type: 'upgradeScheme' }), 'ws://example.com/live', null, EXTENSION)).toBe(
      'wss://example.com/live',
    );
  });
});

describe("every extension's verdict at once", () => {
  it.each([
    [[{ kind: 'redirect', url: 'https://a.example/' }, { kind: 'block' }], { kind: 'block' }],
    [
      [
        { kind: 'redirect', url: 'https://older.example/' },
        { kind: 'redirect', url: 'https://newer.example/' },
      ],
      { kind: 'redirect', url: 'https://newer.example/' },
    ],
    [[{ kind: 'allow' }, { kind: 'none' }], { kind: 'allow' }],
    [[], { kind: 'none' }],
  ] as const)('%j comes to %j', (verdicts, expected) => {
    expect(combineVerdicts(verdicts)).toEqual(expected);
  });
});
