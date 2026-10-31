// Libs
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Utils
import { isRecord } from '../../data/persistence';
import { matchesPattern } from '../../../shared/extensions/extensions';
import { RuleIndex, keysOf, type RequestKeys } from './rule-index';
import { type RequestContext, type RequestDetails, requestContextFrom } from './request-context';
import { combineVerdicts, headerRules, redirectTarget, winningRule, type NetVerdict } from './outcome';
import { readRule, type HeaderChange, type Rule } from './rule';
import { compileRegexFilter } from './url-filter';
import { MatchedRules } from './matched-rules';

/** Chrome's limits, so an extension that checks them sees the numbers it would there. */
export const NET_RULE_LIMITS = {
  MAX_NUMBER_OF_DYNAMIC_RULES: 30_000,
  MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: 5_000,
  MAX_NUMBER_OF_SESSION_RULES: 5_000,
  MAX_NUMBER_OF_UNSAFE_SESSION_RULES: 5_000,
  MAX_NUMBER_OF_REGEX_RULES: 1_000,
  MAX_NUMBER_OF_STATIC_RULESETS: 100,
  MAX_NUMBER_OF_ENABLED_STATIC_RULESETS: 50,
  GUARANTEED_MINIMUM_STATIC_RULES: 30_000,
  DYNAMIC_RULESET_ID: '_dynamic',
  SESSION_RULESET_ID: '_session',
} as const;

// Shared by every extension in Chrome; one extension here can use what the guarantee leaves.
const STATIC_RULE_ALLOWANCE = 300_000;
// Chrome's, though its binding does not name it.
const MAX_NUMBER_OF_DISABLED_STATIC_RULES = 5_000;

/** A call the extension made wrongly, which Chrome rejects with this message rather than ignoring. */
export class RefusedCall extends Error {}

/** What an extension's rules are kept as between runs. */
export interface KeptNetRules {
  dynamicRules: unknown[];
  /** The static rulesets switched on, or null for the ones the manifest switches on. */
  enabledRulesets: string[] | null;
  /** Rules of a static ruleset switched off one by one, by ruleset. */
  disabledStaticRules: Record<string, number[]>;
  displaysActionCount: boolean;
}

export interface NetRulesStore {
  get(extensionId: string): KeptNetRules | null;
  put(extensionId: string, kept: KeptNetRules): void;
  remove(extensionId: string): void;
}

/** What loading an extension's rules needs to know about it. */
export interface NetRulesExtension {
  id: string;
  folder: string;
  manifest: Record<string, unknown>;
  permissions: readonly string[];
  hostPermissions: readonly string[];
}

interface StaticRuleset {
  path: string;
  isEnabledByManifest: boolean;
  index: RuleIndex | null;
}

interface ExtensionRules {
  extension: NetRulesExtension;
  rulesets: Map<string, StaticRuleset>;
  enabled: Set<string>;
  disabledStatic: Map<string, Set<number>>;
  dynamic: Rule[];
  dynamicIndex: RuleIndex;
  session: Rule[];
  sessionIndex: RuleIndex;
  displaysActionCount: boolean;
}

const numbersIn = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];

// declarativeNetRequest's own leave, which needs no host permission.
const BLOCK_OR_ALLOW = new Set(['block', 'allow', 'allowAllRequests']);

/** The rules in a list that can be used, leaving out the rest, as Chrome does for what an extension shipped or kept. */
function usableRules(values: readonly unknown[]): Rule[] {
  return values.flatMap((value) => {
    const reading = readRule(value);
    return 'rule' in reading ? [reading.rule] : [];
  });
}

const hasNetRules = (extension: NetRulesExtension) =>
  extension.permissions.includes('declarativeNetRequest') ||
  extension.permissions.includes('declarativeNetRequestWithHostAccess');

/** Reads every rule in a list, refusing the whole list over one bad rule, as Chrome does for an extension's call. */
function readRules(value: unknown): Rule[] {
  if (!Array.isArray(value)) {
    throw new RefusedCall('Rules must be a list');
  }
  return value.map((item) => {
    const reading = readRule(item);
    if ('problem' in reading) {
      throw new RefusedCall(reading.problem);
    }
    return reading.rule;
  });
}

function rulesetsOf(extension: NetRulesExtension): Map<string, StaticRuleset> {
  const declared = isRecord(extension.manifest.declarative_net_request)
    ? extension.manifest.declarative_net_request.rule_resources
    : undefined;
  const rulesets = new Map<string, StaticRuleset>();
  if (!Array.isArray(declared)) {
    return rulesets;
  }
  for (const resource of declared.slice(0, NET_RULE_LIMITS.MAX_NUMBER_OF_STATIC_RULESETS)) {
    if (isRecord(resource) && typeof resource.id === 'string' && typeof resource.path === 'string') {
      rulesets.set(resource.id, { path: resource.path, isEnabledByManifest: resource.enabled === true, index: null });
    }
  }
  return rulesets;
}

/**
 * Chrome's declarativeNetRequest for every extension of a profile: the rules it
 * ships, the ones it adds as it runs, and the verdict they come to for each
 * request. Requests from Hush never reach here, since no extension runs there.
 */
export class ExtensionNetRules {
  // In install order, so the newest redirect wins as it does in Chrome.
  private readonly extensions = new Map<string, ExtensionRules>();
  /** Pages an extension allowed everything on, and at what priority, until the page navigates. */
  private readonly allowedPages = new Map<string, Map<number, number>>();
  private readonly counts = new Map<string, Map<number, number>>();
  private readonly matches: MatchedRules;
  /** Which ruleset each rule came from, filled as the rules are indexed, for the matched-rules report. */
  private readonly rulesetOf = new WeakMap<Rule, string>();

  constructor(
    private readonly store: NetRulesStore,
    /** Told when what an extension blocked on a page changes, for a badge that shows it. */
    private readonly onCount: (extensionId: string, webContentsId: number, count: number) => void,
    /** Why a static ruleset could not be read, written down rather than thrown at the extension. */
    private readonly onProblem: (extensionId: string, problem: string) => void,
    now: () => number = Date.now,
  ) {
    this.matches = new MatchedRules(now);
  }

  load(extension: NetRulesExtension): void {
    this.unload(extension.id);
    if (!hasNetRules(extension)) {
      return;
    }
    const kept = this.store.get(extension.id);
    const rulesets = rulesetsOf(extension);
    const enabled = new Set(
      kept?.enabledRulesets?.filter((id) => rulesets.has(id)) ??
        [...rulesets].filter(([, ruleset]) => ruleset.isEnabledByManifest).map(([id]) => id),
    );
    const disabledStatic = new Map(
      Object.entries(kept?.disabledStaticRules ?? {})
        .filter(([id]) => rulesets.has(id))
        .map(([id, ruleIds]) => [id, new Set(ruleIds)]),
    );
    const dynamic = usableRules(kept?.dynamicRules ?? []);
    const rules: ExtensionRules = {
      extension,
      rulesets,
      enabled,
      disabledStatic,
      dynamic,
      dynamicIndex: this.indexed(dynamic, NET_RULE_LIMITS.DYNAMIC_RULESET_ID),
      session: [],
      sessionIndex: new RuleIndex([]),
      displaysActionCount: kept?.displaysActionCount ?? false,
    };
    enabled.forEach((id) => this.indexRuleset(rules, id));
    this.extensions.set(extension.id, rules);
  }

  /** Stops applying an extension's rules, as when it is turned off; what it kept stays for next time. */
  unload(extensionId: string): void {
    this.extensions.delete(extensionId);
    this.allowedPages.delete(extensionId);
    this.counts.delete(extensionId);
    this.matches.forget(extensionId);
  }

  /** A new version was put in: as in Chrome, its manifest decides the rulesets again, and only its dynamic rules stay. */
  resetForNewVersion(extensionId: string): void {
    const kept = this.store.get(extensionId);
    if (kept) {
      this.store.put(extensionId, { ...kept, enabledRulesets: null, disabledStaticRules: {} });
    }
  }

  /** Removes an extension and everything its rules kept. */
  forget(extensionId: string): void {
    this.unload(extensionId);
    this.store.remove(extensionId);
  }

  /** A page started loading something new: what was allowed on it and counted for it was about the last one. */
  pageStarted(webContentsId: number): void {
    this.allowedPages.forEach((pages) => pages.delete(webContentsId));
    this.counts.forEach((pages, extensionId) => {
      // Only a badge the count drew is cleared; one the extension set itself is its own.
      if (pages.delete(webContentsId) && this.extensions.get(extensionId)?.displaysActionCount) {
        this.onCount(extensionId, webContentsId, 0);
      }
    });
  }

  // ------------------------------------------------------------ the verdict

  /** The verdict for a request as Electron hands it over; it is not read at all while no extension has rules. */
  judge(details: RequestDetails): NetVerdict {
    const context = this.extensions.size > 0 ? requestContextFrom(details) : null;
    return context ? this.decide(context) : { kind: 'none' };
  }

  /** The header changes for a request as Electron hands it over, read only when some rule changes headers. */
  headerChanges(details: RequestDetails, stage: 'request' | 'response'): HeaderChange[] {
    const hasHeaderRules = [...this.extensions.values()].some((rules) => this.hasHeaderRules(rules));
    const context = hasHeaderRules ? requestContextFrom(details) : null;
    return context ? this.headerChangesFor(context, stage) : [];
  }

  /** What every extension's rules decided for a request, as one verdict. */
  decide(context: RequestContext): NetVerdict {
    if (context.isFromExtension || this.extensions.size === 0) {
      return { kind: 'none' };
    }
    // A new page in a tab starts its count again, and what was allowed on the last page goes with it.
    if (context.request.resourceType === 'main_frame' && context.webContentsId !== null) {
      this.pageStarted(context.webContentsId);
    }
    const keys = keysOf(context.request);
    return combineVerdicts([...this.extensions.values()].map((rules) => this.decideFor(rules, context, keys)));
  }

  /** The header changes every extension's rules ask of a request or its response, highest priority first. */
  headerChangesFor(context: RequestContext, stage: 'request' | 'response'): HeaderChange[] {
    if (context.isFromExtension || this.extensions.size === 0) {
      return [];
    }
    const keys = keysOf(context.request);
    // The newest extension's first, so its change to a header is the one that settles it, as in Chrome.
    return [...this.extensions.values()].toReversed().flatMap((rules) => {
      if (!this.hasHeaderRules(rules)) {
        return [];
      }
      const matched = this.matching(rules, context, keys);
      const applied = headerRules(matched, winningRule(matched, context.request.url));
      // Recorded once a request, at its first stage, though a rule may change the response too.
      if (stage === 'request') {
        applied.forEach((rule) => this.recordMatch(rules, rule, context));
      }
      return applied.flatMap(
        (rule) => (stage === 'request' ? rule.action.requestHeaders : rule.action.responseHeaders) ?? [],
      );
    });
  }

  private indexesOf(rules: ExtensionRules): RuleIndex[] {
    return [
      ...[...rules.enabled].flatMap((id) => rules.rulesets.get(id)?.index ?? []),
      rules.dynamicIndex,
      rules.sessionIndex,
    ];
  }

  private hasHeaderRules(rules: ExtensionRules): boolean {
    return this.indexesOf(rules).some((index) => index.hasHeaderRules);
  }

  private matching(rules: ExtensionRules, context: RequestContext, keys: RequestKeys): Rule[] {
    const { request } = context;
    const fromRulesets = [...rules.enabled].flatMap((id) => {
      const found = rules.rulesets.get(id)?.index?.matching(request, keys) ?? [];
      const disabled = rules.disabledStatic.get(id);
      return disabled ? found.filter((rule) => !disabled.has(rule.id)) : found;
    });
    const matched = [
      ...fromRulesets,
      ...rules.dynamicIndex.matching(request, keys),
      ...rules.sessionIndex.matching(request, keys),
    ].filter((rule) => this.mayChange(rules.extension, rule, request.url));
    const allowedAt =
      context.webContentsId !== null && request.resourceType !== 'main_frame'
        ? this.allowedPages.get(rules.extension.id)?.get(context.webContentsId)
        : undefined;
    // Everything on a page an extension allowed counts as matching its allow-everything rule.
    return allowedAt === undefined
      ? matched
      : [...matched, { id: 0, priority: allowedAt, action: { type: 'allowAllRequests' }, condition: {} }];
  }

  // As in Chrome: anything but blocking and allowing needs the site's host permission, which `tabs` is not.
  private mayChange(extension: NetRulesExtension, rule: Rule, url: string): boolean {
    if (BLOCK_OR_ALLOW.has(rule.action.type) && extension.permissions.includes('declarativeNetRequest')) {
      return true;
    }
    return extension.hostPermissions.some((pattern) => matchesPattern(pattern, url));
  }

  private decideFor(rules: ExtensionRules, context: RequestContext, keys: RequestKeys): NetVerdict {
    const { request, webContentsId } = context;
    const winner = winningRule(this.matching(rules, context, keys), request.url);
    if (request.resourceType === 'main_frame' && webContentsId !== null) {
      const pages = this.allowedPages.get(rules.extension.id) ?? new Map<number, number>();
      if (winner?.action.type === 'allowAllRequests') {
        pages.set(webContentsId, winner.priority);
      } else {
        pages.delete(webContentsId);
      }
      this.allowedPages.set(rules.extension.id, pages);
    }
    if (!winner) {
      return { kind: 'none' };
    }
    if (winner.action.type === 'allow' || winner.action.type === 'allowAllRequests') {
      this.recordMatch(rules, winner, context);
      return { kind: 'allow' };
    }
    if (winner.action.type === 'block') {
      this.count(rules.extension.id, webContentsId);
      this.recordMatch(rules, winner, context);
      return { kind: 'block' };
    }
    const pattern = this.patternFor(rules, winner);
    const url = redirectTarget(winner, request.url, pattern, rules.extension.id);
    if (!url || url === request.url) {
      return { kind: 'none' };
    }
    this.count(rules.extension.id, webContentsId);
    this.recordMatch(rules, winner, context);
    return { kind: 'redirect', url };
  }

  /**
   * Written down for getMatchedRules, and only for an extension that may read
   * it; the stand-in for a page an extension allowed everything on names no rule.
   */
  private recordMatch(rules: ExtensionRules, rule: Rule, context: RequestContext): void {
    const rulesetId = this.rulesetOf.get(rule);
    if (rulesetId !== undefined && rules.extension.permissions.includes('declarativeNetRequestFeedback')) {
      this.matches.record(rules.extension.id, { ruleId: rule.id, rulesetId }, context.request.tabId);
    }
  }

  private patternFor(rules: ExtensionRules, rule: Rule): RegExp | null {
    return (
      this.indexesOf(rules)
        .map((index) => index.patternFor(rule))
        .find((pattern) => pattern !== null) ?? null
    );
  }

  private count(extensionId: string, webContentsId: number | null): void {
    if (webContentsId === null) {
      return;
    }
    const pages = this.counts.get(extensionId) ?? new Map<number, number>();
    const count = (pages.get(webContentsId) ?? 0) + 1;
    pages.set(webContentsId, count);
    this.counts.set(extensionId, pages);
    if (this.extensions.get(extensionId)?.displaysActionCount) {
      this.onCount(extensionId, webContentsId, count);
    }
  }

  // ---------------------------------------------------------------- the API

  /** One chrome.declarativeNetRequest call; a wrong one throws RefusedCall, which the extension sees as a rejection. */
  call(extensionId: string, method: string, args: readonly unknown[]): unknown {
    const rules = this.extensions.get(extensionId);
    if (!rules) {
      return null;
    }
    const options = isRecord(args[0]) ? args[0] : {};
    switch (method) {
      case 'updateDynamicRules':
        rules.dynamic = this.updated(rules.dynamic, options, NET_RULE_LIMITS.MAX_NUMBER_OF_DYNAMIC_RULES);
        rules.dynamicIndex = this.indexed(rules.dynamic, NET_RULE_LIMITS.DYNAMIC_RULESET_ID);
        this.keep(rules);
        return null;
      case 'getDynamicRules':
        return this.filtered(rules.dynamic, options);
      case 'updateSessionRules':
        rules.session = this.updated(rules.session, options, NET_RULE_LIMITS.MAX_NUMBER_OF_SESSION_RULES);
        rules.sessionIndex = this.indexed(rules.session, NET_RULE_LIMITS.SESSION_RULESET_ID);
        return null;
      case 'getSessionRules':
        return this.filtered(rules.session, options);
      case 'updateEnabledRulesets':
        this.updateEnabled(rules, options);
        return null;
      case 'getEnabledRulesets':
        return [...rules.enabled];
      case 'updateStaticRules':
        this.updateStatic(rules, options);
        return null;
      case 'getDisabledRuleIds':
        return [...(rules.disabledStatic.get(this.rulesetNamed(rules, options.rulesetId)) ?? [])];
      case 'getAvailableStaticRuleCount':
        return Math.max(0, STATIC_RULE_ALLOWANCE - this.enabledRuleCount(rules));
      case 'isRegexSupported': {
        const regex = typeof options.regex === 'string' ? options.regex : '';
        return compileRegexFilter(regex, options.isCaseSensitive === true)
          ? { isSupported: true }
          : { isSupported: false, reason: 'syntaxError' };
      }
      case 'setExtensionActionOptions':
        if (typeof options.displayActionCountAsBadgeText === 'boolean') {
          rules.displaysActionCount = options.displayActionCountAsBadgeText;
          this.keep(rules);
        }
        return null;
      case 'getMatchedRules': {
        // Chrome's rule: the report is for an extension that asked for it. activeTab alone is not tracked here.
        if (!rules.extension.permissions.includes('declarativeNetRequestFeedback')) {
          throw new RefusedCall(
            'The extension must have the declarativeNetRequestFeedback permission or have activeTab granted for the specified tab ID in order to call this function.',
          );
        }
        return {
          rulesMatchedInfo: this.matches.list(extensionId, {
            ...(typeof options.tabId === 'number' ? { tabId: options.tabId } : {}),
            ...(typeof options.minTimeStamp === 'number' ? { minTimeStamp: options.minTimeStamp } : {}),
          }),
        };
      }
      case 'testMatchOutcome':
        return { matchedRules: [] };
      default:
        return null;
    }
  }

  private updated(current: Rule[], options: Record<string, unknown>, limit: number): Rule[] {
    const removed = new Set(numbersIn(options.removeRuleIds));
    const added = options.addRules === undefined ? [] : readRules(options.addRules);
    const kept = current.filter((rule) => !removed.has(rule.id));
    const ids = new Set(kept.map((rule) => rule.id));
    for (const rule of added) {
      if (ids.has(rule.id)) {
        throw new RefusedCall(`Rule with id ${rule.id} does not have a unique ID.`);
      }
      ids.add(rule.id);
    }
    const next = [...kept, ...added];
    if (next.length > limit) {
      throw new RefusedCall(`The number of rules exceeds the limit of ${limit}.`);
    }
    const regexCount = next.filter((rule) => rule.condition.regexFilter !== undefined).length;
    if (regexCount > NET_RULE_LIMITS.MAX_NUMBER_OF_REGEX_RULES) {
      throw new RefusedCall(
        `The number of regex rules exceeds the limit of ${NET_RULE_LIMITS.MAX_NUMBER_OF_REGEX_RULES}.`,
      );
    }
    // Those already kept were checked when they were added.
    const unreadable = added.find(
      (rule) =>
        rule.condition.regexFilter !== undefined &&
        !compileRegexFilter(rule.condition.regexFilter, rule.condition.isUrlFilterCaseSensitive),
    );
    if (unreadable) {
      throw new RefusedCall(`Rule with id ${unreadable.id} specified a malformed regular expression.`);
    }
    return next;
  }

  private filtered(rules: readonly Rule[], options: Record<string, unknown>): Rule[] {
    const wanted = Array.isArray(options.ruleIds) ? new Set(options.ruleIds) : null;
    return wanted ? rules.filter((rule) => wanted.has(rule.id)) : [...rules];
  }

  private updateEnabled(rules: ExtensionRules, options: Record<string, unknown>): void {
    const named = (value: unknown) =>
      Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    const toEnable = named(options.enableRulesetIds);
    const unnamedRulesetId = [...toEnable, ...named(options.disableRulesetIds)].find((id) => !rules.rulesets.has(id));
    if (unnamedRulesetId) {
      throw new RefusedCall(`Invalid ruleset id: ${unnamedRulesetId}.`);
    }
    const next = new Set(rules.enabled);
    named(options.disableRulesetIds).forEach((id) => next.delete(id));
    toEnable.forEach((id) => next.add(id));
    if (next.size > NET_RULE_LIMITS.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS) {
      throw new RefusedCall('The number of enabled static rulesets exceeds the limit.');
    }
    rules.enabled = next;
    toEnable.forEach((id) => this.indexRuleset(rules, id));
    this.keep(rules);
  }

  private rulesetNamed(rules: ExtensionRules, value: unknown): string {
    const id = typeof value === 'string' ? value : '';
    if (!rules.rulesets.has(id)) {
      throw new RefusedCall(`Invalid ruleset id: ${id}.`);
    }
    return id;
  }

  // Whether or not the ruleset is switched on, as in Chrome, so the rules stay off when it is switched on later.
  private updateStatic(rules: ExtensionRules, options: Record<string, unknown>): void {
    const rulesetId = this.rulesetNamed(rules, options.rulesetId);
    const next = new Set(rules.disabledStatic.get(rulesetId));
    numbersIn(options.disableRuleIds).forEach((id) => next.add(id));
    numbersIn(options.enableRuleIds).forEach((id) => next.delete(id));
    const othersDisabled = [...rules.disabledStatic]
      .filter(([id]) => id !== rulesetId)
      .reduce((total, [, ruleIds]) => total + ruleIds.size, 0);
    if (othersDisabled + next.size > MAX_NUMBER_OF_DISABLED_STATIC_RULES) {
      throw new RefusedCall('The number of disabled static rules exceeds the limit.');
    }
    rules.disabledStatic.set(rulesetId, next);
    this.keep(rules);
  }

  private enabledRuleCount(rules: ExtensionRules): number {
    return [...rules.enabled].reduce((total, id) => {
      const index = rules.rulesets.get(id)?.index;
      return total + (index?.size ?? 0);
    }, 0);
  }

  private indexed(list: readonly Rule[], rulesetId: string): RuleIndex {
    list.forEach((rule) => this.rulesetOf.set(rule, rulesetId));
    return new RuleIndex(list);
  }

  private indexRuleset(rules: ExtensionRules, id: string): void {
    const ruleset = rules.rulesets.get(id);
    if (!ruleset || ruleset.index) {
      return;
    }
    const file = path.join(rules.extension.folder, ruleset.path.replace(/^\/+/, ''));
    // Inside the extension's own folder, whatever the manifest says the path is.
    if (path.relative(rules.extension.folder, file).startsWith('..')) {
      this.onProblem(rules.extension.id, `ruleset ${id} points outside the extension`);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      // A static ruleset keeps the rules it can use, as Chrome skips a bad one at install with a warning.
      ruleset.index = this.indexed(usableRules(Array.isArray(parsed) ? parsed : []), id);
    } catch (error) {
      this.onProblem(
        rules.extension.id,
        `ruleset ${id} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private keep(rules: ExtensionRules): void {
    this.store.put(rules.extension.id, {
      dynamicRules: rules.dynamic,
      enabledRulesets: [...rules.enabled],
      disabledStaticRules: Object.fromEntries(
        [...rules.disabledStatic]
          .filter(([, ruleIds]) => ruleIds.size > 0)
          .map(([id, ruleIds]) => [id, [...ruleIds]]),
      ),
      displaysActionCount: rules.displaysActionCount,
    });
  }
}
