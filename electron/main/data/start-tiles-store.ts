// Utils
import { MAX_SHORTCUTS, MAX_SHORTCUT_TITLE, type StartShortcut } from '../../shared/data/start-tiles';
import { sameSite } from '../../shared/data/forgetting';
import { inTransaction } from './database';

// Types
import type { DatabaseSync } from 'node:sqlite';

/** The start page's own tiles, and the sites someone asked it to stop showing. */
export class StartTilesStore {
  constructor(private readonly database: DatabaseSync) {}

  shortcuts(): StartShortcut[] {
    return this.database
      .prepare('SELECT url, title, icon FROM start_shortcuts ORDER BY position')
      .all()
      .map((row) => ({ url: String(row.url), title: String(row.title), icon: row.icon ? String(row.icon) : null }));
  }

  /** Replaces the tile that was at `previousUrl`, in its place, or adds one at the end. */
  saveShortcut(previousUrl: string | null, shortcut: StartShortcut): void {
    const title = shortcut.title.trim().slice(0, MAX_SHORTCUT_TITLE);
    inTransaction(this.database, () => {
      const existing = this.database
        .prepare('SELECT position FROM start_shortcuts WHERE url = ?')
        .get(previousUrl ?? shortcut.url);
      if (existing) {
        this.database
          .prepare('DELETE FROM start_shortcuts WHERE url IN (?, ?)')
          .run(previousUrl ?? shortcut.url, shortcut.url);
        this.database
          .prepare('INSERT INTO start_shortcuts (url, title, icon, position) VALUES (?, ?, ?, ?)')
          .run(shortcut.url, title, shortcut.icon, Number(existing.position));
        return;
      }
      const count = Number(this.database.prepare('SELECT count(*) AS count FROM start_shortcuts').get()?.count);
      if (count >= MAX_SHORTCUTS) {
        return;
      }
      const last = this.database.prepare('SELECT coalesce(max(position), -1) AS position FROM start_shortcuts').get();
      this.database.prepare('DELETE FROM start_shortcuts WHERE url = ?').run(shortcut.url);
      this.database
        .prepare('INSERT INTO start_shortcuts (url, title, icon, position) VALUES (?, ?, ?, ?)')
        .run(shortcut.url, title, shortcut.icon, Number(last?.position) + 1);
    });
  }

  removeShortcut(url: string): void {
    this.database.prepare('DELETE FROM start_shortcuts WHERE url = ?').run(url);
  }

  /** A shortcut and its place, so an undo puts it back where it was. */
  snapshot(url: string): { shortcut: StartShortcut; position: number } | null {
    const row = this.database
      .prepare('SELECT url, title, icon, position FROM start_shortcuts WHERE url = ?')
      .get(url);
    return row
      ? {
          shortcut: { url: String(row.url), title: String(row.title), icon: row.icon ? String(row.icon) : null },
          position: Number(row.position),
        }
      : null;
  }

  restoreShortcut(snapshot: { shortcut: StartShortcut; position: number }): void {
    const { shortcut, position } = snapshot;
    this.database
      .prepare('INSERT OR IGNORE INTO start_shortcuts (url, title, icon, position) VALUES (?, ?, ?, ?)')
      .run(shortcut.url, shortcut.title, shortcut.icon, position);
  }

  showSite(site: string): void {
    this.database.prepare('DELETE FROM start_hidden WHERE site = ?').run(site);
  }

  hiddenSites(): string[] {
    return this.database
      .prepare('SELECT site FROM start_hidden')
      .all()
      .map((row) => String(row.site));
  }

  hideSite(site: string): void {
    this.database.prepare('INSERT OR IGNORE INTO start_hidden (site) VALUES (?)').run(site);
  }

  /** Forgetting a site takes its tiles with it, since a tile names where you went. */
  forgetSite(site: string): void {
    const shortcuts = this.shortcuts().filter((shortcut) => sameSite(shortcut.url, site));
    const hidden = this.hiddenSites().filter((entry) => sameSite(entry, site));
    shortcuts.forEach((shortcut) => this.removeShortcut(shortcut.url));
    hidden.forEach((entry) => this.database.prepare('DELETE FROM start_hidden WHERE site = ?').run(entry));
  }

  countForSite(site: string): number {
    return (
      this.shortcuts().filter((shortcut) => sameSite(shortcut.url, site)).length +
      this.hiddenSites().filter((entry) => sameSite(entry, site)).length
    );
  }
}
