// Libs
import { existsSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Utils
import { sameSite } from '../../shared/data/forgetting';
import { describeError, log } from '../system/diagnostics';

/** One step in the database's shape, applied once, in order, and recorded in `PRAGMA user_version`. */
export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE history (
        rowid INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT '',
        last_visited_at INTEGER NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 1,
        blocked_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX history_by_recency ON history (last_visited_at DESC);
      -- Trigram, so a search for part of a word or an address is an index lookup rather than a scan.
      CREATE VIRTUAL TABLE history_search USING fts5(
        url, title, content = 'history', content_rowid = 'rowid', tokenize = 'trigram'
      );
      -- The index's own copy of a forgotten address is removed too, rather than marked deleted and kept until a merge.
      INSERT INTO history_search (history_search, rank) VALUES ('secure-delete', 1);
      CREATE TRIGGER history_search_insert AFTER INSERT ON history BEGIN
        INSERT INTO history_search (rowid, url, title) VALUES (new.rowid, new.url, new.title);
      END;
      CREATE TRIGGER history_search_delete AFTER DELETE ON history BEGIN
        INSERT INTO history_search (history_search, rowid, url, title) VALUES ('delete', old.rowid, old.url, old.title);
      END;
      CREATE TRIGGER history_search_update AFTER UPDATE OF url, title ON history BEGIN
        INSERT INTO history_search (history_search, rowid, url, title) VALUES ('delete', old.rowid, old.url, old.title);
        INSERT INTO history_search (rowid, url, title) VALUES (new.rowid, new.url, new.title);
      END;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE favicons (
        origin TEXT PRIMARY KEY,
        data_url TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE downloads (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        save_path TEXT NOT NULL,
        url TEXT NOT NULL,
        received_bytes INTEGER NOT NULL,
        total_bytes INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        url_chain TEXT NOT NULL DEFAULT '[]',
        sha256 TEXT
      );
    `,
  },
  {
    version: 4,
    sql: `
      -- Position keeps the order the interface shows: newest bookmark first, folders in the order they were made.
      CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        folder_id TEXT
      );
      CREATE INDEX bookmarks_in_order ON bookmarks (position);
      CREATE TABLE bookmark_folders (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        colour TEXT NOT NULL,
        parent_id TEXT,
        collapsed INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 5,
    sql: `
      -- What was decided about particular sites, kept out of settings.json so that file names no site at all.
      CREATE TABLE site_permissions (
        origin TEXT NOT NULL,
        kind TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
        PRIMARY KEY (origin, kind)
      );
      CREATE TABLE site_zoom (
        origin TEXT PRIMARY KEY,
        zoom_factor REAL NOT NULL
      );
      CREATE TABLE tracker_exceptions (
        site TEXT PRIMARY KEY,
        position INTEGER NOT NULL
      );
    `,
  },
  {
    version: 6,
    sql: `
      -- The index's own secure delete rewrites every row sharing a trigram with the one removed, and with
      -- trigrams that is all of them: 3.4s to forget a site at 10,000 pages. Forgetting optimises the index
      -- instead, which drops deleted entries in one pass, and secure_delete overwrites the pages that frees.
      INSERT INTO history_search (history_search, rank) VALUES ('secure-delete', 0);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE named_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      );
      CREATE TABLE named_session_tabs (
        session_id TEXT NOT NULL REFERENCES named_sessions (id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        PRIMARY KEY (session_id, position)
      );
    `,
  },
  {
    version: 8,
    sql: `
      -- Where a site always opens: 'hush', or 'group:' and a group's id.
      CREATE TABLE open_rules (
        site TEXT PRIMARY KEY,
        target TEXT NOT NULL
      );
    `,
  },
  {
    version: 9,
    sql: `
      CREATE TABLE start_shortcuts (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        icon TEXT,
        position INTEGER NOT NULL
      );
      -- Sites the start page was asked to stop suggesting, by site.
      CREATE TABLE start_hidden (
        site TEXT PRIMARY KEY
      );
    `,
  },
];

const SIDE_FILES = ['', '-wal', '-shm'];

/** Runs `work` as one transaction: all of it lands, or none of it does. */
export function inTransaction(database: DatabaseSync, work: () => void): void {
  database.exec('BEGIN');
  try {
    work();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function userVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get();
  return typeof row?.user_version === 'number' ? row.user_version : 0;
}

function open(filePath: string): DatabaseSync {
  const database = new DatabaseSync(filePath);
  // WAL so a write never blocks a read, and NORMAL because WAL already keeps the file consistent through a crash.
  database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  // Deleted rows are overwritten, not left in free pages: forgetting a site has to mean it is gone from the file.
  database.exec('PRAGMA secure_delete = ON;');
  // The one rule about what counts as the same site, so SQL and the rest of the app cannot disagree.
  database.function('same_site', { deterministic: true }, (url, site) =>
    typeof url === 'string' && typeof site === 'string' && sameSite(url, site) ? 1 : 0,
  );
  return database;
}

/**
 * Opens the database, bringing its shape up to date.
 *
 * A database written by a newer build is set aside rather than opened, as a
 * newer JSON file is: guessing at a future shape and writing to it would
 * destroy whatever the newer build kept there.
 */
export function openDatabase(
  filePath: string,
  migrations: readonly Migration[] = MIGRATIONS,
  onSetAside: (asidePath: string) => void = () => {},
): DatabaseSync {
  const latest = migrations.at(-1)?.version ?? 0;
  let database: DatabaseSync;
  let found: number;
  try {
    database = open(filePath);
    found = userVersion(database);
  } catch (error) {
    // A file SQLite cannot read would stop the app opening at all; it is kept aside, never deleted, and a fresh one made.
    const aside = `${filePath}.unreadable-${Date.now()}`;
    log.warn('the database could not be opened and was kept aside', { ...describeError(error) });
    SIDE_FILES.filter((suffix) => existsSync(`${filePath}${suffix}`)).forEach((suffix) =>
      renameSync(`${filePath}${suffix}`, `${aside}${suffix}`),
    );
    onSetAside(aside);
    database = open(filePath);
    found = userVersion(database);
  }

  if (found > latest) {
    database.close();
    log.warn('the database came from a newer version and was kept aside', { found, latest });
    SIDE_FILES.filter((suffix) => existsSync(`${filePath}${suffix}`)).forEach((suffix) =>
      renameSync(`${filePath}${suffix}`, `${filePath}.newer${suffix}`),
    );
    database = open(filePath);
  }

  const current = userVersion(database);
  migrations
    .filter((migration) => migration.version > current)
    .forEach((migration) => {
      // One transaction per step, so a failure leaves the database at the last step that finished.
      inTransaction(database, () => {
        database.exec(migration.sql);
        database.exec(`PRAGMA user_version = ${migration.version}`);
      });
    });

  return database;
}
