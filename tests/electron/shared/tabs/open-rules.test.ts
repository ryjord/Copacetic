import { describe, expect, it } from 'vitest';
import {
  groupTarget,
  isOpenTarget,
  openRuleFor,
  placeByRule,
  withoutGroup,
} from '../../../../electron/shared/tabs/open-rules';

const rules = { 'bank.example': 'hush', 'work.example': groupTarget('work') } as const;
const exists = (groupId: string) => groupId === 'work';
const ordinary = { hush: false, groupId: null };

describe('openRuleFor', () => {
  it('holds for every part of the site, not just the address it was set on', () => {
    expect(openRuleFor(rules, 'https://login.bank.example/session')).toBe('hush');
    expect(openRuleFor(rules, 'https://elsewhere.example/')).toBeNull();
  });
});

describe('placeByRule', () => {
  it('sends a page to Hush, or to its group', () => {
    expect(placeByRule(ordinary, 'hush', exists)).toEqual({ hush: true, groupId: null });
    expect(placeByRule(ordinary, groupTarget('work'), exists)).toEqual({ hush: false, groupId: 'work' });
  });

  it('never moves a page out of Hush', () => {
    const hush = { hush: true, groupId: null };
    expect(placeByRule(hush, groupTarget('work'), exists)).toBe(hush);
  });

  it('changes nothing for a tab already where the rule wants it, or for a group that is gone', () => {
    const working = { hush: false, groupId: 'work' };
    expect(placeByRule(working, groupTarget('work'), exists)).toBe(working);
    expect(placeByRule(ordinary, groupTarget('deleted'), exists)).toBe(ordinary);
    expect(placeByRule(ordinary, null, exists)).toBe(ordinary);
  });
});

describe('the rules a renderer may send', () => {
  it('takes Hush or a group, and nothing else', () => {
    expect(isOpenTarget('hush')).toBe(true);
    expect(isOpenTarget('group:abc_DEF-1')).toBe(true);
    expect(isOpenTarget('group:')).toBe(false);
    expect(isOpenTarget('window')).toBe(false);
    expect(isOpenTarget(7)).toBe(false);
  });

  it('lets a deleted group take its rules with it', () => {
    expect(withoutGroup(rules, 'work')).toEqual({ 'bank.example': 'hush' });
  });
});
