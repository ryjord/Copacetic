// Libs
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Larger than any profile a person keeps; past this a file is not worth freezing the browser to read. */
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024 * 1024;

/**
 * Reads another browser's database from a copy, journal and all, since that
 * browser may be running and holding its own file. The copying is
 * asynchronous, so a large profile does not stop every window while it moves.
 */
export async function withCopyOf<T>(file: string, prefix: string, read: (copy: string) => T): Promise<T> {
  const { size } = await stat(file);
  if (size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`${path.basename(file)} is too large to import`);
  }
  const scratch = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    const copy = path.join(scratch, path.basename(file));
    await copyFile(file, copy);
    await Promise.all(
      ['-journal', '-wal']
        .filter((suffix) => existsSync(`${file}${suffix}`))
        .map((suffix) => copyFile(`${file}${suffix}`, `${copy}${suffix}`)),
    );
    return read(copy);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
