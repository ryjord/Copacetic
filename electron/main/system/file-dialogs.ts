import { type BrowserWindow, type FileFilter, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * What came of putting a file dialog in front of someone. Cancelling is not a
 * failure and carries no sentence, because they know what they just did; only
 * something that went wrong is worth saying out loud.
 */
export interface FileResult<T> {
  value: T | null;
  message: string;
}

const CANCELLED = { value: null, message: '' };

const reasonFor = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Asks for a file and reads it as text. */
export async function readChosenFile(
  window: BrowserWindow,
  options: { title: string; filters: FileFilter[] },
): Promise<FileResult<string>> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: options.title,
    properties: ['openFile'],
    filters: options.filters,
  });

  const source = filePaths[0];
  if (canceled || !source) {
    return CANCELLED;
  }

  try {
    return { value: await readFile(source, 'utf8'), message: '' };
  } catch (error) {
    return { value: null, message: reasonFor(error, 'The file could not be read.') };
  }
}

/** Asks where to put a file and writes it. The contents are produced only once somewhere has been chosen. */
export async function writeChosenFile(
  window: BrowserWindow,
  options: { title: string; defaultPath: string; filters: FileFilter[] },
  contents: () => string,
): Promise<FileResult<true>> {
  const { canceled, filePath } = await dialog.showSaveDialog(window, options);
  if (canceled || !filePath) {
    return CANCELLED;
  }

  try {
    await writeFile(filePath, contents(), 'utf8');
    return { value: true, message: '' };
  } catch (error) {
    return { value: null, message: reasonFor(error, 'The file could not be written.') };
  }
}

/** Today, as the date a file written now should carry in its name. */
export function fileStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
