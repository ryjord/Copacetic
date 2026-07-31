import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A single JSON file on disk, written atomically and flushed on a debounce.
 *
 * Browser state changes constantly (every navigation touches history), so
 * writing synchronously on every mutation would stall navigation. Instead
 * mutations update memory immediately and the file catches up shortly after,
 * with a synchronous flush on quit so nothing is lost on exit.
 */
export class PersistedFile<T> {
  private value: T;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;
  private dirty = false;

  constructor(
    filename: string,
    private readonly fallback: () => T,
    private readonly revive: (raw: unknown) => T | null,
    private readonly flushDelayMs = 400,
  ) {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, filename);
    this.value = this.load();
  }

  private load(): T {
    if (!existsSync(this.filePath)) return this.fallback();
    try {
      const revived = this.revive(JSON.parse(readFileSync(this.filePath, 'utf8')));
      return revived ?? this.fallback();
    } catch (error) {
      // A corrupt file must never stop the browser from starting. Move it aside
      // so the user can recover it manually, and carry on with defaults.
      console.error(`[persistence] ${path.basename(this.filePath)} is unreadable, starting fresh`, error);
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
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  /** Write immediately. Called on app quit. */
  flush(): void {
    if (!this.dirty) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const tempPath = `${this.filePath}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      writeFileSync(tempPath, JSON.stringify(this.value), 'utf8');
      renameSync(tempPath, this.filePath);
      this.dirty = false;
    } catch (error) {
      console.error(`[persistence] failed to write ${path.basename(this.filePath)}`, error);
      try {
        if (existsSync(tempPath)) unlinkSync(tempPath);
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
