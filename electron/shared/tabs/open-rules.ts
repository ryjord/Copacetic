import { siteOf } from '../data/forgetting';

/** Where a site always opens: in Hush, or in one group's tabs. */
export type OpenTarget = 'hush' | `group:${string}`;

/** Keyed by site, so a rule for example.com holds for www. and every other part of it. */
export type OpenRules = Record<string, OpenTarget>;

export const MAX_OPEN_RULES = 500;

export function groupTarget(groupId: string): OpenTarget {
  return `group:${groupId}`;
}

export function groupIdOf(target: OpenTarget): string | null {
  return target === 'hush' ? null : target.slice('group:'.length);
}

export function isOpenTarget(value: unknown): value is OpenTarget {
  return value === 'hush' || (typeof value === 'string' && /^group:[\w-]{1,64}$/.test(value));
}

export function openRuleFor(rules: OpenRules, url: string): OpenTarget | null {
  const site = siteOf(url);
  return site ? (rules[site] ?? null) : null;
}

/**
 * Whether a tab has to give a page to another tab for its site's rule.
 *
 * Never out of Hush: a rule that moved a Hush tab's page into a group would
 * write down a visit someone opened Hush to keep off the disk.
 */
export function shouldMoveFor(tab: { isHush: boolean; groupId: string | null }, target: OpenTarget): boolean {
  if (tab.isHush) {
    return false;
  }
  return target === 'hush' || tab.groupId !== groupIdOf(target);
}

export interface Placement {
  hush: boolean;
  groupId: string | null;
}

/** Where a page belongs once its site's rule is applied; the same object back when the rule changes nothing. */
export function placeByRule(
  place: Placement,
  target: OpenTarget | null,
  groupExists: (groupId: string) => boolean,
): Placement {
  if (!target || !shouldMoveFor({ isHush: place.hush, groupId: place.groupId }, target)) {
    return place;
  }
  if (target === 'hush') {
    return { hush: true, groupId: null };
  }
  const groupId = groupIdOf(target);
  return groupId && groupExists(groupId) ? { hush: false, groupId } : place;
}

export function withoutGroup(rules: OpenRules, groupId: string): OpenRules {
  return Object.fromEntries(Object.entries(rules).filter(([, target]) => groupIdOf(target) !== groupId));
}
