// Types
import type { ActionType, HeaderChange, Rule } from './rule';

/** What one extension's rules decided for a request. */
export type NetVerdict = { kind: 'none' } | { kind: 'allow' } | { kind: 'block' } | { kind: 'redirect'; url: string };

// Chrome's order when two rules of one extension share a priority.
const ACTION_ORDER: Record<ActionType, number> = {
  allow: 0,
  allowAllRequests: 1,
  block: 2,
  upgradeScheme: 3,
  redirect: 4,
  modifyHeaders: 5,
};

const isUpgradable = (url: string) => url.startsWith('http:') || url.startsWith('ws:');

/** The rule that decides a request among one extension's matches; header rules never do. */
export function winningRule(matched: readonly Rule[], url: string): Rule | null {
  return (
    matched
      .filter((rule) => rule.action.type !== 'modifyHeaders')
      // An upgrade has nothing to do to an address that is already secure.
      .filter((rule) => rule.action.type !== 'upgradeScheme' || isUpgradable(url))
      .toSorted(
        (aRule, bRule) =>
          bRule.priority - aRule.priority || ACTION_ORDER[aRule.action.type] - ACTION_ORDER[bRule.action.type],
      )[0] ?? null
  );
}

/** The header rules that still apply: above an allow that won, all of them when nothing won, none past a block. */
export function headerRules(matched: readonly Rule[], winner: Rule | null): Rule[] {
  const isAllowed = winner?.action.type === 'allow' || winner?.action.type === 'allowAllRequests';
  if (winner && !isAllowed) {
    return [];
  }
  return matched
    .filter((rule) => rule.action.type === 'modifyHeaders' && (!winner || rule.priority > winner.priority))
    .toSorted((aRule, bRule) => bRule.priority - aRule.priority);
}

/**
 * Applies header rules in priority order: once a higher rule has set or removed
 * a header, a lower one leaves it alone, though appends add up, as in Chrome.
 */
export function applyHeaderChanges(
  headers: Record<string, string>,
  rules: readonly Rule[],
  pick: (rule: Rule) => HeaderChange[] | undefined,
): Record<string, string> {
  const changed = { ...headers };
  const settled = new Set<string>();
  const keyFor = (name: string) => Object.keys(changed).find((key) => key.toLowerCase() === name) ?? name;
  for (const rule of rules) {
    for (const change of pick(rule) ?? []) {
      const name = change.header.toLowerCase();
      if (settled.has(name)) {
        continue;
      }
      const key = keyFor(name);
      if (change.operation === 'remove') {
        delete changed[key];
        settled.add(name);
      } else if (change.operation === 'set') {
        changed[key] = change.value ?? '';
        settled.add(name);
      } else {
        changed[key] = changed[key] === undefined ? (change.value ?? '') : `${changed[key]}, ${change.value ?? ''}`;
      }
    }
  }
  return changed;
}

/** Where a redirect rule sends a request, or null when the address it would build is not one. */
export function redirectTarget(rule: Rule, url: string, pattern: RegExp | null, extensionId: string): string | null {
  const redirect = rule.action.redirect;
  if (rule.action.type === 'upgradeScheme') {
    return url.replace(/^http:/, 'https:').replace(/^ws:/, 'wss:');
  }
  if (!redirect) {
    return null;
  }
  if (redirect.url) {
    return redirect.url;
  }
  if (redirect.extensionPath) {
    return `chrome-extension://${extensionId}${redirect.extensionPath}`;
  }
  if (redirect.regexSubstitution !== undefined && pattern) {
    // Chrome writes \1 for a captured group and \0 for the whole match.
    const substitution = redirect.regexSubstitution
      .replace(/\$/g, '$$$$')
      .replace(/\\([0-9])/g, (_whole, digit: string) => (digit === '0' ? '$&' : `$${digit}`));
    return url.replace(pattern, substitution);
  }
  if (redirect.transform) {
    try {
      const target = new URL(url);
      const { transform } = redirect;
      if (transform.scheme) {
        target.protocol = `${transform.scheme}:`;
      }
      if (transform.host !== undefined) {
        target.hostname = transform.host;
      }
      if (transform.port !== undefined) {
        target.port = transform.port;
      }
      if (transform.path !== undefined) {
        target.pathname = transform.path;
      }
      if (transform.query !== undefined) {
        target.search = transform.query;
      }
      transform.queryTransform?.removeParams?.forEach((key) => target.searchParams.delete(key));
      transform.queryTransform?.addOrReplaceParams?.forEach(({ key, value }) => target.searchParams.set(key, value));
      if (transform.fragment !== undefined) {
        target.hash = transform.fragment;
      }
      if (transform.username !== undefined) {
        target.username = transform.username;
      }
      if (transform.password !== undefined) {
        target.password = transform.password;
      }
      return target.href;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Every extension's verdict, newest install last, as one: a block from any of
 * them stops the request, and otherwise the newest redirect wins, as in Chrome.
 */
export function combineVerdicts(verdicts: readonly NetVerdict[]): NetVerdict {
  if (verdicts.some((verdict) => verdict.kind === 'block')) {
    return { kind: 'block' };
  }
  const redirect = verdicts.filter((verdict) => verdict.kind === 'redirect').at(-1);
  if (redirect) {
    return redirect;
  }
  return verdicts.some((verdict) => verdict.kind === 'allow') ? { kind: 'allow' } : { kind: 'none' };
}
