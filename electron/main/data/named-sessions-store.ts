// Utils
import { MAX_NAMED_SESSIONS, MAX_SESSION_NAME, MAX_SESSION_TABS } from '../../shared/data/named-sessions';
import { inTransaction } from './database';
import { newId } from './persistence';

// Types
import type { DatabaseSync } from 'node:sqlite';
import type { NamedSessionSummary, NamedSessionTab } from '../../shared/data/named-sessions';

/** Sets of tabs someone chose to keep, by name, to open again later. */
export class NamedSessionsStore {
  constructor(private readonly database: DatabaseSync) {}

  list(): NamedSessionSummary[] {
    return this.database
      .prepare(
        `SELECT id, name, saved_at, (SELECT count(*) FROM named_session_tabs WHERE session_id = id) AS tab_count
         FROM named_sessions ORDER BY saved_at DESC`,
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        savedAt: Number(row.saved_at),
        tabCount: Number(row.tab_count),
      }));
  }

  tabsOf(id: string): NamedSessionTab[] {
    return this.database
      .prepare('SELECT url, title FROM named_session_tabs WHERE session_id = ? ORDER BY position')
      .all(id)
      .map((row) => ({ url: String(row.url), title: String(row.title) }));
  }

  /** The oldest goes once there are as many as are kept, so saving never fails for want of room. */
  save(name: string, now: number, tabs: readonly NamedSessionTab[]): NamedSessionSummary {
    const kept = tabs.slice(0, MAX_SESSION_TABS);
    const summary = {
      id: newId(),
      name: name.trim().slice(0, MAX_SESSION_NAME),
      savedAt: now,
      tabCount: kept.length,
    };
    inTransaction(this.database, () => {
      this.database
        .prepare('INSERT INTO named_sessions (id, name, saved_at) VALUES (?, ?, ?)')
        .run(summary.id, summary.name, summary.savedAt);
      const insertTab = this.database.prepare(
        'INSERT INTO named_session_tabs (session_id, position, url, title) VALUES (?, ?, ?, ?)',
      );
      kept.forEach((tab, position) => insertTab.run(summary.id, position, tab.url, tab.title));
      this.database
        .prepare(
          'DELETE FROM named_sessions WHERE id NOT IN (SELECT id FROM named_sessions ORDER BY saved_at DESC LIMIT ?)',
        )
        .run(MAX_NAMED_SESSIONS);
    });
    return summary;
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim().slice(0, MAX_SESSION_NAME);
    if (trimmed) {
      this.database.prepare('UPDATE named_sessions SET name = ? WHERE id = ?').run(trimmed, id);
    }
  }

  remove(id: string): void {
    this.database.prepare('DELETE FROM named_sessions WHERE id = ?').run(id);
  }
}
