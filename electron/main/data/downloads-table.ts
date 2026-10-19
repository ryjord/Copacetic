import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { DownloadState, DownloadStatus } from '../../shared/types';
import { inTransaction } from './database';
import { importLegacyFile } from './legacy-import';
import { asNumber, asString, isRecord, newId } from './persistence';

const LEGACY_FILE = 'downloads.json';

/**
 * The downloads list, kept in the database and written on a short debounce.
 *
 * A download reports progress many times a second; writing each tick would be
 * a write per tick for a number nobody reads back until the next start. So the
 * list is held in memory, as the JSON file it replaces was, and written as a
 * whole a moment after it last changed.
 */
export class DownloadsTable {
  private entries: DownloadState[];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseSync,
    directory: string,
    private readonly flushDelayMs = 1_000,
  ) {
    importLegacyFile(database, directory, LEGACY_FILE, reviveDownloads, (entries) => this.write(entries));
    this.entries = this.read();
  }

  get(): DownloadState[] {
    return this.entries;
  }

  update(change: (entries: DownloadState[]) => DownloadState[]): void {
    this.entries = change(this.entries);
    this.schedule();
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    inTransaction(this.database, () => this.write(this.entries));
  }

  private schedule(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => this.flush(), this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  private write(entries: DownloadState[]): void {
    this.database.exec('DELETE FROM downloads');
    const insert = this.database.prepare(
      `INSERT INTO downloads (id, filename, save_path, url, received_bytes, total_bytes, status, started_at, completed_at, url_chain, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    entries.forEach((entry) =>
      insert.run(
        entry.id,
        entry.filename,
        entry.savePath,
        entry.url,
        entry.receivedBytes,
        entry.totalBytes,
        entry.status,
        entry.startedAt,
        entry.completedAt,
        JSON.stringify(entry.urlChain),
        entry.sha256,
      ),
    );
  }

  // Read back through the same reviver as the old file, so a row is held to the same rules whichever it came from.
  private read(): DownloadState[] {
    const rows = this.database
      .prepare('SELECT * FROM downloads ORDER BY started_at DESC')
      .all()
      .map((row) => ({
        id: row.id,
        filename: row.filename,
        savePath: row.save_path,
        url: row.url,
        receivedBytes: row.received_bytes,
        totalBytes: row.total_bytes,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        urlChain: parseChain(row.url_chain),
        sha256: row.sha256,
      }));
    return reviveDownloads(rows) ?? [];
  }
}

function parseChain(value: unknown): unknown {
  try {
    return typeof value === 'string' ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export function reviveDownloads(raw: unknown): DownloadState[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const allowed: DownloadStatus[] = ['progressing', 'paused', 'completed', 'cancelled', 'interrupted'];
  return raw.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const savePath = asString(item.savePath);
    if (!savePath) {
      return [];
    }
    const status = asString(item.status) as DownloadStatus;
    return [
      {
        id: asString(item.id) || newId(),
        filename: asString(item.filename) || path.basename(savePath),
        savePath,
        url: asString(item.url),
        receivedBytes: asNumber(item.receivedBytes),
        totalBytes: asNumber(item.totalBytes),
        bytesPerSecond: null,
        status: allowed.includes(status) ? status : 'interrupted',
        startedAt: asNumber(item.startedAt, Date.now()),
        completedAt: typeof item.completedAt === 'number' ? item.completedAt : null,
        fileExists: false,
        // Kept across restarts: the route a file took and what arrived are
        // exactly what you want to check later rather than at the time.
        urlChain: Array.isArray(item.urlChain) ? item.urlChain.filter((url) => typeof url === 'string') : [],
        sha256: typeof item.sha256 === 'string' ? item.sha256 : null,
      },
    ];
  });
}
