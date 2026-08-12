import { type DownloadItem, type Session, app, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DownloadState, DownloadStatus } from '../shared/types';
import { PersistedFile, asNumber, asString, isRecord, newId } from './persistence';

/** How often a download's speed sample is refreshed. */
const SPEED_SAMPLE_MS = 700;
const MAX_REMEMBERED = 200;

/** Control characters, which can truncate the name a file manager displays. */
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

// Bidirectional overrides and marks.
const BIDI_OVERRIDES = new RegExp('[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');

const RESERVED_PATH_CHARACTERS = /[/\\:*?"<>|]/g;

// Windows treats these as device names rather than files, in any directory and with any extension.
const WINDOWS_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

interface LiveDownload {
  item: DownloadItem;
  lastSampleAt: number;
  lastSampleBytes: number;
  /** So a pause or an interruption is reported the instant it happens. */
  lastStatus: DownloadStatus;
}

export class DownloadManager {
  private readonly file: PersistedFile<DownloadState[]>;
  private readonly live = new Map<string, LiveDownload>();

  constructor(private readonly onChanged: () => void) {
    this.file = new PersistedFile<DownloadState[]>('downloads.json', () => [], reviveDownloads, 1_000);
    // Anything still in flight when the app last quit cannot be resumed: the
    // DownloadItem it belonged to is gone. Report that honestly rather than
    // showing a progress bar that will never move.
    this.file.update((entries) =>
      entries.map((entry) =>
        entry.status === 'progressing' || entry.status === 'paused'
          ? { ...entry, status: 'interrupted' as const, bytesPerSecond: null }
          : entry,
      ),
    );
  }

  flush(): void {
    this.file.flush();
  }

  list(): DownloadState[] {
    return this.file.get().map((entry) => ({
      ...entry,
      fileExists: entry.status === 'completed' ? existsSync(entry.savePath) : entry.fileExists,
    }));
  }

  attach(session: Session): void {
    session.on('will-download', (_event, item) => {
      const id = newId();
      const directory = app.getPath('downloads');
      const savePath = uniqueSavePath(directory, sanitiseFilename(item.getFilename()));
      item.setSavePath(savePath);

      this.live.set(id, { item, lastSampleAt: Date.now(), lastSampleBytes: 0, lastStatus: 'progressing' });
      this.upsert({
        id,
        filename: path.basename(savePath),
        savePath,
        url: item.getURL(),
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        bytesPerSecond: null,
        status: 'progressing',
        startedAt: Date.now(),
        completedAt: null,
        fileExists: false,
      });

      item.on('updated', (_updatedEvent, state) => {
        const live = this.live.get(id);
        if (!live) {
          return;
        }

        const now = Date.now();
        const received = item.getReceivedBytes();
        const status = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
        const sampleDue = now - live.lastSampleAt >= SPEED_SAMPLE_MS;

        // Chromium fires `updated` far faster than anyone can read, and each
        // one used to push the whole browser state to the renderer. The speed
        // sample was already throttled; the push it caused was not. A byte
        // count nobody can perceive changing is not worth a render, so the
        // renderer hears about progress on the sample interval — and
        // immediately whenever the status itself changes, since pausing should
        // never look like it did nothing.
        const statusChanged = status !== live.lastStatus;
        if (!sampleDue && !statusChanged) {
          return;
        }

        let bytesPerSecond: number | null = null;
        if (sampleDue) {
          bytesPerSecond = Math.max(
            0,
            ((received - live.lastSampleBytes) * 1000) / Math.max(1, now - live.lastSampleAt),
          );
          live.lastSampleAt = now;
          live.lastSampleBytes = received;
        }
        live.lastStatus = status;

        this.patch(id, (entry) => ({
          ...entry,
          receivedBytes: received,
          totalBytes: item.getTotalBytes(),
          status,
          bytesPerSecond: bytesPerSecond ?? entry.bytesPerSecond,
        }));
      });

      item.once('done', (_doneEvent, state) => {
        this.live.delete(id);
        const status: DownloadStatus =
          state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
        this.patch(id, (entry) => ({
          ...entry,
          status,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes() || item.getReceivedBytes(),
          bytesPerSecond: null,
          completedAt: Date.now(),
          fileExists: status === 'completed' && existsSync(entry.savePath),
        }));
      });
    });
  }

  pause(id: string): void {
    this.live.get(id)?.item.pause();
  }

  resume(id: string): void {
    const live = this.live.get(id);
    if (live?.item.canResume()) {
      live.item.resume();
    }
  }

  cancel(id: string): void {
    this.live.get(id)?.item.cancel();
  }

  /** Resolves with an empty string on success, or a message to show the user. */
  async openFile(id: string): Promise<string> {
    const entry = this.find(id);
    if (!entry) {
      return 'That download is no longer listed.';
    }
    if (entry.status !== 'completed') {
      return 'That download has not finished.';
    }
    if (!existsSync(entry.savePath)) {
      this.patch(id, (current) => ({ ...current, fileExists: false }));
      return 'That file is no longer where Copacetic saved it.';
    }
    return shell.openPath(entry.savePath);
  }

  revealFile(id: string): void {
    const entry = this.find(id);
    if (!entry) {
      return;
    }
    if (!existsSync(entry.savePath)) {
      this.patch(id, (current) => ({ ...current, fileExists: false }));
      return;
    }
    shell.showItemInFolder(entry.savePath);
  }

  remove(id: string): void {
    this.live.get(id)?.item.cancel();
    this.live.delete(id);
    this.file.update((entries) => entries.filter((entry) => entry.id !== id));
    this.onChanged();
  }

  clearCompleted(): void {
    this.file.update((entries) =>
      entries.filter((entry) => entry.status === 'progressing' || entry.status === 'paused'),
    );
    this.onChanged();
  }

  cancelAllInFlight(): void {
    for (const live of this.live.values()) {
      live.item.cancel();
    }
    this.live.clear();
  }

  private find(id: string): DownloadState | undefined {
    return this.file.get().find((entry) => entry.id === id);
  }

  private upsert(entry: DownloadState): void {
    this.file.update((entries) =>
      [entry, ...entries.filter((existing) => existing.id !== entry.id)].slice(0, MAX_REMEMBERED),
    );
    this.onChanged();
  }

  private patch(id: string, mutate: (entry: DownloadState) => DownloadState): void {
    let touched = false;
    this.file.update((entries) =>
      entries.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        touched = true;
        return mutate(entry);
      }),
    );
    if (touched) {
      this.onChanged();
    }
  }
}

/** Strip anything that could let a filename escape the downloads directory or masquerade as a different file type. */
export function sanitiseFilename(filename: string): string {
  const cleaned = path
    .basename(filename)
    .replace(CONTROL_CHARACTERS, '')
    .replace(BIDI_OVERRIDES, '')
    // A leading dot hides the file; a leading `..` would try to climb out.
    .replace(/^\.+/, '')
    .replace(RESERVED_PATH_CHARACTERS, '_')
    // Windows silently drops a trailing dot or space, so `evil.exe.` and
    // `evil.exe ` both land as `evil.exe` after the extension check a user
    // might have done by eye.
    .replace(/[. ]+$/, '')
    .trim();

  if (!cleaned) {
    return 'download';
  }
  // Prefixed rather than rejected, so the user still gets the name they expect
  // to see next to the file they just downloaded.
  return WINDOWS_DEVICE_NAMES.test(cleaned) ? `_${cleaned}`.slice(0, 180) : cleaned.slice(0, 180);
}

export function uniqueSavePath(directory: string, filename: string): string {
  const candidate = path.join(directory, filename);
  if (!existsSync(candidate)) {
    return candidate;
  }

  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  for (let counter = 1; counter < 1000; counter += 1) {
    const next = path.join(directory, `${stem} (${counter})${extension}`);
    if (!existsSync(next)) {
      return next;
    }
  }
  return path.join(directory, `${stem} (${Date.now()})${extension}`);
}

function reviveDownloads(raw: unknown): DownloadState[] | null {
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
      },
    ];
  });
}
