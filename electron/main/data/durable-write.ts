import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from 'node:fs';

/**
 * Writing a file so that a machine losing power cannot leave half of one.
 *
 * Lives on its own because two things need it and one of them is imported by
 * the other: the stores write through `persistence.ts`, and the record of what
 * version each store is at is written by `schema.ts`, which `persistence.ts`
 * imports. The record was written the plain way — no flush to disk, no
 * permissions, no retry — which made the note about the data safer than the
 * data was not, but less safe, which is the wrong way round for the file that
 * says how to read the others.
 */

/** What a flush does to the disk, so it can be watched. */
export interface DiskOperations {
  write(filePath: string, contents: string): void;
  rename(from: string, to: string): void;
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

/** The real ones. Everything uses these unless a test says otherwise. */
export const REAL_DISK: DiskOperations = {
  write: writeTheWholeFile,
  rename: (from, to) => renameOverAnyLock(from, to),
};
