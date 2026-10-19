import type { DatabaseSync } from 'node:sqlite';
import type { PermissionDecision } from '../../shared/types';
import { type OpenRules, isOpenTarget } from '../../shared/tabs/open-rules';
import { inTransaction } from './database';

/** The per-site parts of the settings: what each site may do, how far it is zoomed, and where trackers are allowed. */
export class SiteSettingsStore {
  constructor(private readonly database: DatabaseSync) {}

  /** Keyed `origin|kind`, the shape the rest of the app has always read them in. */
  permissionDecisions(): Record<string, PermissionDecision> {
    return Object.fromEntries(
      this.database
        .prepare('SELECT origin, kind, decision FROM site_permissions')
        .all()
        .map((row) => [`${String(row.origin)}|${String(row.kind)}`, row.decision === 'allow' ? 'allow' : 'deny']),
    );
  }

  permissionDecision(origin: string, kind: string): PermissionDecision | null {
    const row = this.database
      .prepare('SELECT decision FROM site_permissions WHERE origin = ? AND kind = ?')
      .get(origin, kind);
    return row ? (row.decision === 'allow' ? 'allow' : 'deny') : null;
  }

  setPermissionDecision(origin: string, kind: string, decision: PermissionDecision): void {
    this.database
      .prepare('INSERT OR REPLACE INTO site_permissions (origin, kind, decision) VALUES (?, ?, ?)')
      .run(origin, kind, decision);
  }

  replacePermissionDecisions(decisions: Record<string, PermissionDecision>): void {
    inTransaction(this.database, () => {
      this.database.exec('DELETE FROM site_permissions');
      const insert = this.database.prepare('INSERT INTO site_permissions (origin, kind, decision) VALUES (?, ?, ?)');
      Object.entries(decisions).forEach(([key, decision]) => {
        // The kind never holds a bar, the origin might, so the key is split at the last one.
        const separator = key.lastIndexOf('|');
        if (separator > 0) {
          insert.run(key.slice(0, separator), key.slice(separator + 1), decision);
        }
      });
    });
    this.scrub();
  }

  zoomLevels(): Record<string, number> {
    return Object.fromEntries(
      this.database
        .prepare('SELECT origin, zoom_factor FROM site_zoom')
        .all()
        .map((row) => [String(row.origin), Number(row.zoom_factor)]),
    );
  }

  zoomFor(origin: string): number | null {
    const row = this.database.prepare('SELECT zoom_factor FROM site_zoom WHERE origin = ?').get(origin);
    return row ? Number(row.zoom_factor) : null;
  }

  setZoom(origin: string, zoomFactor: number): void {
    this.database
      .prepare('INSERT OR REPLACE INTO site_zoom (origin, zoom_factor) VALUES (?, ?)')
      .run(origin, zoomFactor);
  }

  forgetZoom(origin: string): void {
    this.database.prepare('DELETE FROM site_zoom WHERE origin = ?').run(origin);
  }

  replaceZoomLevels(levels: Record<string, number>): void {
    inTransaction(this.database, () => {
      this.database.exec('DELETE FROM site_zoom');
      const insert = this.database.prepare('INSERT INTO site_zoom (origin, zoom_factor) VALUES (?, ?)');
      Object.entries(levels).forEach(([origin, zoomFactor]) => insert.run(origin, zoomFactor));
    });
    this.scrub();
  }

  /** In the order they were added, which is the order Settings lists them. */
  trackerExceptions(): string[] {
    return this.database
      .prepare('SELECT site FROM tracker_exceptions ORDER BY position')
      .all()
      .map((row) => String(row.site));
  }

  replaceTrackerExceptions(sites: readonly string[]): void {
    inTransaction(this.database, () => {
      this.database.exec('DELETE FROM tracker_exceptions');
      const insert = this.database.prepare('INSERT OR IGNORE INTO tracker_exceptions (site, position) VALUES (?, ?)');
      sites.forEach((site, position) => insert.run(site, position));
    });
    this.scrub();
  }

  openRules(): OpenRules {
    return Object.fromEntries(
      this.database
        .prepare('SELECT site, target FROM open_rules')
        .all()
        .flatMap((row) => (isOpenTarget(row.target) ? [[String(row.site), row.target]] : [])),
    );
  }

  replaceOpenRules(rules: OpenRules): void {
    inTransaction(this.database, () => {
      this.database.exec('DELETE FROM open_rules');
      const insert = this.database.prepare('INSERT INTO open_rules (site, target) VALUES (?, ?)');
      Object.entries(rules).forEach(([site, target]) => insert.run(site, target));
    });
    this.scrub();
  }

  /** A replacement is how a site is forgotten, so the old copies in the write-ahead log go too. */
  private scrub(): void {
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}
