import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { describeError, log } from '../system/diagnostics';
import { UNVERSIONED, type SchemaPlan, type SchemaVersions, migrate, schemaVersionsFor } from './schema';

/** A single JSON file on disk, written atomically and flushed on a debounce. */
export class PersistedFile<T> {
  private value: T;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private dirty = false;

  private readonly versions: SchemaVersions;

  constructor(
    private readonly filename: string,
    private readonly fallback: () => T,
    private readonly revive: (raw: unknown) => T | null,
    private readonly flushDelayMs = 400,
    /** How this file's shape has changed over time. Files that have never changed shape need nothing here. */
    private readonly plan: SchemaPlan = UNVERSIONED,
  ) {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, filename);
    this.versions = schemaVersionsFor(dir);
    this.value = this.load();
  }

  /**
   * A file written by a newer build than this one. Reading it would mean
   * guessing at a shape from the future, and writing it back would then destroy
   * whatever the newer build had put there — so it is kept, untouched and named
   * so it can be found, and this build starts fresh.
   */
  private setAsideNewerFile(found: number): void {
    console.error(`[persistence] ${this.filename} was written by a newer version (${found}), keeping it aside`);
    log.warn('a stored file came from a newer version and was kept aside', { file: this.filename, found });
    try {
      renameSync(this.filePath, `${this.filePath}.newer`);
    } catch {
      /* best effort */
    }
  }

  private load(): T {
    if (!existsSync(this.filePath)) {
      return this.fallback();
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      const outcome = migrate(raw, this.versions.versionOf(this.filename), this.plan);

      if (outcome.status === 'from-a-newer-version') {
        this.setAsideNewerFile(outcome.found);
        return this.fallback();
      }

      const revived = this.revive(outcome.data);
      if (outcome.status === 'migrated') {
        console.info(`[persistence] ${this.filename}: ${outcome.applied.join(', ')}`);
        log.info('a stored file was brought up to date', {
          file: this.filename,
          from: outcome.from,
          steps: outcome.applied.join(', '),
        });
        // Write it back in the new shape rather than migrating it again next time.
        this.dirty = true;
        this.scheduleFlush();
      }
      return revived ?? this.fallback();
    } catch (error) {
      // A corrupt file must never stop the browser from starting. Move it aside
      // so the user can recover it manually, and carry on with defaults.
      console.error(`[persistence] ${path.basename(this.filePath)} is unreadable, starting fresh`, error);
      log.error('a stored file could not be read, starting fresh', { file: this.filename, ...describeError(error) });
      try {
        renameSync(this.filePath, `${this.filePath}.corrupt`);
      } catch {
        /* best effort */
      }
      return this.fallback();
    }
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    this.value = next;
    this.dirty = true;
    this.scheduleFlush();
  }

  update(mutate: (current: T) => T): T {
    this.set(mutate(this.value));
    return this.value;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  /** Write immediately. Called on app quit. */
  flush(): void {
    if (!this.dirty) {
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const tempPath = `${this.filePath}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      writeTheWholeFile(tempPath, JSON.stringify(this.value));
      renameOverAnyLock(tempPath, this.filePath);
      this.dirty = false;
      // Recorded only once the write it describes has actually happened.
      this.versions.record(this.filename, this.plan.current);
    } catch (error) {
      console.error(`[persistence] failed to write ${path.basename(this.filePath)}`, error);
      log.error('a stored file could not be written', { file: this.filename, ...describeError(error) });
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {
        /* best effort */
      }
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function newId(): string {
  return randomBytes(9).toString('base64url');
}

/**
 * How long to keep trying a rename that something else is holding open.
 *
 * Windows will not rename over a file another process has open, and an
 * antivirus scanner or the search indexer opens a file the moment it is
 * written. The failure is EPERM or EBUSY, it is transient, and it lands on the
 * one step that publishes the new data — so without this, a scan running at the
 * wrong moment loses the write entirely and the app reports a file it could not
 * save.
 */
const RENAME_ATTEMPTS = 5;

/** Sleeps without an event loop, which a synchronous flush does not have. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function renameOverAnyLock(from: string, to: string, rename: typeof renameSync = renameSync): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!transient || attempt >= RENAME_ATTEMPTS) {
        throw error;
      }
      pause(attempt * 20);
    }
  }
}

/**
 * Writes a file and waits for the disk to say so.
 *
 * `writeFileSync` returns once the data is in the operating system's cache, not
 * once it is on the disk. Renaming after that is atomic in the sense that
 * matters — nobody sees half a file — but a machine that loses power in between
 * can make the rename durable and the contents not, which publishes an empty or
 * truncated file at the real path. The whole point of writing to a temporary
 * name first is to avoid exactly that.
 *
 * The mode is 0600 because these files are browsing history, bookmarks, saved
 * sessions and the vault's own record. The default leaves them readable by
 * every account on the machine.
 */
function writeTheWholeFile(filePath: string, contents: string): void {
  const handle = openSync(filePath, 'w', 0o600);
  try {
    writeFileSync(handle, contents, 'utf8');
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
