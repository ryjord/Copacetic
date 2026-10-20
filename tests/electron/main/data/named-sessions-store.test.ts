import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { NamedSessionsStore } = await import('../../../../electron/main/data/named-sessions-store');
const { openDatabase } = await import('../../../../electron/main/data/database');
const { MAX_NAMED_SESSIONS, MAX_SESSION_NAME } = await import('../../../../electron/shared/data/named-sessions');

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'copacetic-sessions-'));
});
const openStore = () => new NamedSessionsStore(openDatabase(path.join(directory, 'copacetic.db')));
const tabs = [
  { url: 'https://example.com/one', title: 'One' },
  { url: 'https://example.com/two', title: 'Two' },
];

describe('saved sessions', () => {
  it('keeps the tabs in their order, and lists the newest first', () => {
    const store = openStore();
    const older = store.save('Older', 1_000, tabs);
    const newer = store.save('Newer', 2_000, tabs.toReversed());

    expect(store.list().map((session) => session.name)).toEqual(['Newer', 'Older']);
    expect(store.list()[0]?.tabCount).toBe(2);
    expect(store.tabsOf(older.id).map((tab) => tab.title)).toEqual(['One', 'Two']);
    expect(store.tabsOf(newer.id).map((tab) => tab.title)).toEqual(['Two', 'One']);
  });

  it('survives the app closing', () => {
    const saved = openStore().save('Kept', 1_000, tabs);
    expect(openStore().tabsOf(saved.id)).toEqual(tabs);
  });

  it('takes its tabs with it when deleted', () => {
    const store = openStore();
    const saved = store.save('Gone', 1_000, tabs);
    store.remove(saved.id);
    expect(store.list()).toEqual([]);
    expect(store.tabsOf(saved.id)).toEqual([]);
  });

  it('makes room by letting the oldest go, rather than refusing to save', () => {
    const store = openStore();
    Array.from({ length: MAX_NAMED_SESSIONS + 1 }, (_unused, index) => store.save(`Session ${index}`, index, tabs));
    const names = store.list().map((session) => session.name);
    expect(names).toHaveLength(MAX_NAMED_SESSIONS);
    expect(names).not.toContain('Session 0');
  });

  it('keeps a name short, and ignores a rename to nothing', () => {
    const store = openStore();
    const saved = store.save('x'.repeat(200), 1_000, tabs);
    expect(store.list()[0]?.name).toHaveLength(MAX_SESSION_NAME);
    store.rename(saved.id, '   ');
    expect(store.list()[0]?.name).toHaveLength(MAX_SESSION_NAME);
    store.rename(saved.id, 'Research');
    expect(store.list()[0]?.name).toBe('Research');
  });
});
