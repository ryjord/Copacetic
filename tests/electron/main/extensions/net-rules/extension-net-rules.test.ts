import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ExtensionNetRules,
  RefusedCall,
  type KeptNetRules,
  type NetRulesExtension,
  type RequestContext,
} from '../../../../../electron/main/extensions/net-rules/extension-net-rules';

const ID = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

/** An extension folder holding the rulesets it declares. */
function extensionWith(
  rulesets: Record<string, { enabled: boolean; rules: unknown[] }>,
  over: Partial<NetRulesExtension> = {},
): NetRulesExtension {
  const folder = mkdtempSync(path.join(tmpdir(), 'net-rules-'));
  const ruleResources = Object.entries(rulesets).map(([id, ruleset]) => {
    writeFileSync(path.join(folder, `${id}.json`), JSON.stringify(ruleset.rules));
    return { id, enabled: ruleset.enabled, path: `/${id}.json` };
  });
  return {
    id: ID,
    folder,
    manifest: { declarative_net_request: { rule_resources: ruleResources } },
    permissions: ['declarativeNetRequest'],
    hostPermissions: ['<all_urls>'],
    ...over,
  };
}

function fakeStore() {
  const kept = new Map<string, KeptNetRules>();
  return {
    kept,
    get: (id: string) => kept.get(id) ?? null,
    put: (id: string, value: KeptNetRules) => kept.set(id, value),
    remove: (id: string) => kept.delete(id),
  };
}

const context = (url: string, over: Partial<RequestContext['request']> = {}, webContentsId = 4): RequestContext => ({
  request: {
    url,
    host: new URL(url).hostname,
    method: 'get',
    resourceType: 'script',
    initiatorHost: 'news.example.org',
    tabId: webContentsId,
    isThirdParty: true,
    ...over,
  },
  webContentsId,
  isFromExtension: false,
});

const blockAds = { id: 1, action: { type: 'block' }, condition: { urlFilter: '||ads.example^' } };

function setup(rulesets: Parameters<typeof extensionWith>[0] = { main: { enabled: true, rules: [blockAds] } }) {
  const store = fakeStore();
  const counted: [string, number, number][] = [];
  const rules = new ExtensionNetRules(store, (id, page, count) => counted.push([id, page, count]), vi.fn());
  rules.load(extensionWith(rulesets));
  return { rules, store, counted };
}

describe('an extension’s rules', () => {
  it('apply the rulesets its manifest switches on', () => {
    const { rules } = setup({
      main: { enabled: true, rules: [blockAds] },
      extra: { enabled: false, rules: [{ ...blockAds, condition: { urlFilter: '||more.example^' } }] },
    });
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'block' });
    expect(rules.decide(context('https://more.example/a.js'))).toEqual({ kind: 'none' });
  });

  it('switch rulesets on and off when asked, and keep the choice', () => {
    const { rules, store } = setup({ main: { enabled: true, rules: [blockAds] } });
    rules.call(ID, 'updateEnabledRulesets', [{ disableRulesetIds: ['main'] }]);
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'none' });
    expect(store.kept.get(ID)?.enabledRulesets).toEqual([]);
    expect(rules.call(ID, 'getEnabledRulesets', [])).toEqual([]);
  });

  // uBlock Origin Lite turns single shipped rules off this way when a filter of its own overrides them.
  it('switch single shipped rules off, even in a ruleset that is off, and keep that across a restart', () => {
    const otherAds = { ...blockAds, id: 2, condition: { urlFilter: '||more.example^' } };
    const { rules, store } = setup({
      main: { enabled: true, rules: [blockAds, otherAds] },
      extra: { enabled: false, rules: [blockAds] },
    });
    rules.call(ID, 'updateStaticRules', [{ rulesetId: 'main', disableRuleIds: [1] }]);
    rules.call(ID, 'updateStaticRules', [{ rulesetId: 'extra', disableRuleIds: [1] }]);
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'none' });
    expect(rules.decide(context('https://more.example/a.js'))).toEqual({ kind: 'block' });
    expect(rules.call(ID, 'getDisabledRuleIds', [{ rulesetId: 'extra' }])).toEqual([1]);

    rules.call(ID, 'updateEnabledRulesets', [{ enableRulesetIds: ['extra'] }]);
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'none' });

    rules.call(ID, 'updateStaticRules', [{ rulesetId: 'main', enableRuleIds: [1] }]);
    expect(store.kept.get(ID)?.disabledStaticRules).toEqual({ extra: [1] });
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'block' });
    expect(() => rules.call(ID, 'getDisabledRuleIds', [{ rulesetId: 'nonsense' }])).toThrow(RefusedCall);
  });

  it('add dynamic rules that outlast a restart, and session rules that do not', () => {
    const { rules, store } = setup({});
    rules.call(ID, 'updateDynamicRules', [{ addRules: [blockAds] }]);
    rules.call(ID, 'updateSessionRules', [
      { addRules: [{ ...blockAds, id: 2, condition: { urlFilter: '||session.example^' } }] },
    ]);
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'block' });
    expect(rules.decide(context('https://session.example/a.js'))).toEqual({ kind: 'block' });
    expect(store.kept.get(ID)?.dynamicRules).toHaveLength(1);

    const restarted = new ExtensionNetRules(store, vi.fn(), vi.fn());
    restarted.load(extensionWith({}));
    expect(restarted.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'block' });
    expect(restarted.decide(context('https://session.example/a.js'))).toEqual({ kind: 'none' });
  });

  // Chrome rejects these, and an extension that checks for the rejection would otherwise think it worked.
  it.each([
    ['a rule Chrome would refuse', { addRules: [{ id: 0, action: { type: 'block' }, condition: {} }] }],
    ['two rules with one id', { addRules: [blockAds, blockAds] }],
    [
      'a regular expression that will not compile',
      { addRules: [{ id: 3, action: { type: 'block' }, condition: { regexFilter: '(' } }] },
    ],
  ])('refuse %s', (_name, options) => {
    const { rules } = setup({});
    expect(() => rules.call(ID, 'updateDynamicRules', [options])).toThrow(RefusedCall);
  });

  it('refuse a ruleset the manifest never named', () => {
    const { rules } = setup();
    expect(() => rules.call(ID, 'updateEnabledRulesets', [{ enableRulesetIds: ['nonsense'] }])).toThrow(RefusedCall);
  });

  it('let everything through on a page they allow everything on, until it navigates', () => {
    const { rules } = setup({});
    rules.call(ID, 'updateDynamicRules', [
      {
        addRules: [
          blockAds,
          {
            id: 9,
            priority: 5,
            action: { type: 'allowAllRequests' },
            condition: { requestDomains: ['trusted.example'], resourceTypes: ['main_frame'] },
          },
        ],
      },
    ]);
    rules.decide(context('https://trusted.example/', { resourceType: 'main_frame', initiatorHost: null }));
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'allow' });
    rules.decide(context('https://elsewhere.example/', { resourceType: 'main_frame', initiatorHost: null }));
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'block' });
  });

  // Blocking needs no leave to see a site; sending its requests elsewhere does, as in Chrome.
  it('redirect only where they may see the site', () => {
    const store = fakeStore();
    const rules = new ExtensionNetRules(store, vi.fn(), vi.fn());
    rules.load(extensionWith({}, { hostPermissions: ['https://allowed.example/*'] }));
    const redirect = (id: number, host: string) => ({
      id,
      action: { type: 'redirect', redirect: { url: 'https://safe.example/' } },
      condition: { requestDomains: [host] },
    });
    rules.call(ID, 'updateDynamicRules', [
      { addRules: [redirect(1, 'allowed.example'), redirect(2, 'other.example')] },
    ]);
    expect(rules.decide(context('https://allowed.example/x'))).toEqual({
      kind: 'redirect',
      url: 'https://safe.example/',
    });
    expect(rules.decide(context('https://other.example/x'))).toEqual({ kind: 'none' });
  });

  // `tabs` lets an extension read every page's address, which is not leave to change what the site is sent.
  it('do not redirect or change headers on the strength of the tabs permission', () => {
    const rules = new ExtensionNetRules(fakeStore(), vi.fn(), vi.fn());
    rules.load(extensionWith({}, { permissions: ['declarativeNetRequest', 'tabs'], hostPermissions: [] }));
    rules.call(ID, 'updateDynamicRules', [
      {
        addRules: [
          { id: 1, action: { type: 'redirect', redirect: { url: 'https://elsewhere.example/' } }, condition: {} },
          {
            id: 2,
            action: {
              type: 'modifyHeaders',
              responseHeaders: [{ header: 'content-security-policy', operation: 'remove' }],
            },
            condition: {},
          },
        ],
      },
    ]);
    expect(rules.decide(context('https://bank.example/'))).toEqual({ kind: 'none' });
    expect(rules.headerChangesFor(context('https://bank.example/'), 'response')).toEqual([]);
  });

  it('block only on the sites they were given, with declarativeNetRequestWithHostAccess alone', () => {
    const rules = new ExtensionNetRules(fakeStore(), vi.fn(), vi.fn());
    rules.load(
      extensionWith(
        { main: { enabled: true, rules: [{ ...blockAds, condition: {} }] } },
        { permissions: ['declarativeNetRequestWithHostAccess'], hostPermissions: ['https://ads.example/*'] },
      ),
    );
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'block' });
    expect(rules.decide(context('https://news.example/a.js'))).toEqual({ kind: 'none' });
  });

  // Chrome evaluates the more recently installed extension first, so its change to a header is the one made.
  it('let the newest extension settle a header two of them change', () => {
    const rules = new ExtensionNetRules(fakeStore(), vi.fn(), vi.fn());
    const setsAgent = (value: string) => ({
      id: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'user-agent', operation: 'set', value }] },
      condition: {},
    });
    rules.load(extensionWith({ main: { enabled: true, rules: [setsAgent('older')] } }));
    rules.load(extensionWith({ main: { enabled: true, rules: [setsAgent('newer')] } }, { id: OTHER }));
    expect(rules.headerChangesFor(context('https://example.com/'), 'request')[0]).toMatchObject({ value: 'newer' });
  });

  // A new version's manifest decides its rulesets again, as in Chrome; what it added as it ran stays.
  it('start a new version from its manifest’s rulesets, keeping its dynamic rules', () => {
    const { rules, store } = setup({
      main: { enabled: true, rules: [blockAds] },
      extra: { enabled: false, rules: [{ ...blockAds, condition: { urlFilter: '||more.example^' } }] },
    });
    rules.call(ID, 'updateEnabledRulesets', [{ disableRulesetIds: ['main'], enableRulesetIds: ['extra'] }]);
    rules.call(ID, 'updateStaticRules', [{ rulesetId: 'main', disableRuleIds: [1] }]);
    rules.call(ID, 'updateDynamicRules', [
      { addRules: [{ ...blockAds, id: 7, condition: { urlFilter: '||mine.example^' } }] },
    ]);
    rules.resetForNewVersion(ID);
    expect(store.kept.get(ID)).toMatchObject({ enabledRulesets: null, disabledStaticRules: {} });
    expect(store.kept.get(ID)?.dynamicRules).toHaveLength(1);
  });

  it('never change a request an extension made', () => {
    const { rules } = setup();
    expect(rules.decide({ ...context('https://ads.example/a.js'), isFromExtension: true })).toEqual({ kind: 'none' });
  });

  it('count what they block on a page for the badge, once asked to', () => {
    const { rules, counted } = setup();
    rules.decide(context('https://ads.example/a.js'));
    expect(counted).toEqual([]);
    rules.call(ID, 'setExtensionActionOptions', [{ displayActionCountAsBadgeText: true }]);
    rules.decide(context('https://ads.example/b.js'));
    expect(counted.at(-1)).toEqual([ID, 4, 2]);
  });

  // An extension that sets its own badge keeps it when the page moves on, unless the count drew it.
  it('leave a badge alone when the page moves on, if they never asked for the count', () => {
    const { rules, counted } = setup();
    rules.decide(context('https://ads.example/a.js'));
    rules.decide(context('https://news.example/', { resourceType: 'main_frame', initiatorHost: null }));
    expect(counted).toEqual([]);
  });

  it('apply only with the permission for it', () => {
    const store = fakeStore();
    const rules = new ExtensionNetRules(store, vi.fn(), vi.fn());
    rules.load(extensionWith({ main: { enabled: true, rules: [blockAds] } }, { permissions: [] }));
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'none' });
    expect(rules.hasAny).toBe(false);
  });

  it('go when the extension is removed, kept rules and all', () => {
    const { rules, store } = setup({});
    rules.call(ID, 'updateDynamicRules', [{ addRules: [blockAds] }]);
    rules.forget(ID);
    expect(store.kept.has(ID)).toBe(false);
    expect(rules.decide(context('https://ads.example/a.js'))).toEqual({ kind: 'none' });
  });

  it('answer the questions Chrome answers about regular expressions and room left', () => {
    const { rules } = setup();
    expect(rules.call(ID, 'isRegexSupported', [{ regex: '^https://[a-z]+\\.example/' }])).toEqual({
      isSupported: true,
    });
    expect(rules.call(ID, 'isRegexSupported', [{ regex: '(' }])).toEqual({
      isSupported: false,
      reason: 'syntaxError',
    });
    expect(rules.call(ID, 'getAvailableStaticRuleCount', [])).toBe(299_999);
    expect(rules.call(OTHER, 'getDynamicRules', [])).toBeNull();
  });
});
