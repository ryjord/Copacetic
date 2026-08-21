import { describe, expect, it, vi } from 'vitest';
import { PendingPrompts } from '../../electron/main/app/pending-prompts';
import type { AuthPrompt, PermissionPrompt } from '../../electron/shared/types';

const permission = (id: string, tabId: string): PermissionPrompt =>
  ({ id, tabId, origin: 'https://example.com', kind: 'camera', description: 'use the camera' }) as PermissionPrompt;

const auth = (id: string, tabId: string): AuthPrompt => ({ id, tabId }) as AuthPrompt;

/** Registers a challenge the way the real one behaves: responding removes it. */
function addRealisticAuth(prompts: PendingPrompts, id: string, tabId: string) {
  const responded = vi.fn();
  prompts.addAuth(auth(id, tabId), (username?: string) => {
    prompts.forgetAuth(id);
    responded(username);
  });
  return responded;
}

describe('a question that has been answered is gone', () => {
  it('resolves the permission promise with the decision', () => {
    const prompts = new PendingPrompts();
    const resolve = vi.fn();
    prompts.addPermission(permission('p1', 't1'), resolve);

    expect(prompts.resolvePermission('p1', 'allow')?.origin).toBe('https://example.com');
    expect(resolve).toHaveBeenCalledWith('allow');
    expect(prompts.permissionPrompts()).toHaveLength(0);
  });

  it('cannot resolve the same permission twice', () => {
    const prompts = new PendingPrompts();
    const resolve = vi.fn();
    prompts.addPermission(permission('p1', 't1'), resolve);

    prompts.resolvePermission('p1', 'allow');
    expect(prompts.resolvePermission('p1', 'deny')).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer to a prompt that was never asked', () => {
    const prompts = new PendingPrompts();
    expect(prompts.resolvePermission('nope', 'allow')).toBeNull();
    expect(() => prompts.cancelAuth('nope')).not.toThrow();
  });
});

describe('closing a tab answers everything it was waiting on', () => {
  it('denies the permission rather than leaving the page waiting forever', () => {
    const prompts = new PendingPrompts();
    const resolve = vi.fn();
    prompts.addPermission(permission('p1', 't1'), resolve);

    expect(prompts.dropForTab('t1')).toBe(true);
    expect(resolve).toHaveBeenCalledWith('deny');
    expect(prompts.permissionPrompts()).toHaveLength(0);
  });

  it('cancels the challenge, so the request behind it stops waiting', () => {
    const prompts = new PendingPrompts();
    const responded = addRealisticAuth(prompts, 'a1', 't1');

    expect(prompts.dropForTab('t1')).toBe(true);
    expect(responded).toHaveBeenCalledWith(undefined);
    expect(prompts.authPrompts()).toHaveLength(0);
  });

  // Each response removes its own entry from the map being walked, so this pins
  // that walking it is still complete.
  it('cancels every challenge on the tab, not every other one', () => {
    const prompts = new PendingPrompts();
    const first = addRealisticAuth(prompts, 'a1', 't1');
    const second = addRealisticAuth(prompts, 'a2', 't1');
    const third = addRealisticAuth(prompts, 'a3', 't1');

    prompts.dropForTab('t1');

    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(third).toHaveBeenCalled();
    expect(prompts.authPrompts()).toHaveLength(0);
  });

  it('leaves prompts belonging to other tabs alone', () => {
    const prompts = new PendingPrompts();
    const mine = vi.fn();
    const theirs = vi.fn();
    prompts.addPermission(permission('p1', 't1'), mine);
    prompts.addPermission(permission('p2', 't2'), theirs);
    const theirChallenge = addRealisticAuth(prompts, 'a2', 't2');

    prompts.dropForTab('t1');

    expect(mine).toHaveBeenCalledWith('deny');
    expect(theirs).not.toHaveBeenCalled();
    expect(theirChallenge).not.toHaveBeenCalled();
    expect(prompts.permissionPrompts().map((p) => p.id)).toEqual(['p2']);
  });

  // The caller only redraws the chrome when this is true.
  it('reports that nothing was settled when the tab had nothing pending', () => {
    const prompts = new PendingPrompts();
    prompts.addPermission(permission('p1', 't1'), vi.fn());
    expect(prompts.dropForTab('t2')).toBe(false);
  });
});

describe('quitting answers the rest', () => {
  it('denies every outstanding permission and cancels every challenge', () => {
    const prompts = new PendingPrompts();
    const one = vi.fn();
    const two = vi.fn();
    prompts.addPermission(permission('p1', 't1'), one);
    prompts.addPermission(permission('p2', 't2'), two);
    const first = addRealisticAuth(prompts, 'a1', 't1');
    const second = addRealisticAuth(prompts, 'a2', 't2');

    prompts.settleAll();

    expect(one).toHaveBeenCalledWith('deny');
    expect(two).toHaveBeenCalledWith('deny');
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(prompts.permissionPrompts()).toHaveLength(0);
    expect(prompts.authPrompts()).toHaveLength(0);
  });
});
