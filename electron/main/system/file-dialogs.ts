import { type BrowserWindow, type FileFilter, dialog } from 'electron';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { t } from '../../shared/i18n/translate';

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
    return { value: null, message: reasonFor(error, t('main.files.readFailed')) };
  }
}

/** Asks for a picture and reads it as a data URL, refusing one larger than `maxBytes`. */
export async function readChosenImage(
  window: BrowserWindow,
  options: { title: string; maxBytes: number; tooLarge: string },
): Promise<FileResult<string>> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: options.title,
    properties: ['openFile'],
    filters: [{ name: t('main.files.images'), extensions: Object.keys(IMAGE_TYPES) }],
  });
  const source = filePaths[0];
  if (canceled || !source) {
    return CANCELLED;
  }
  const type = IMAGE_TYPES[path.extname(source).slice(1).toLowerCase()];
  if (!type) {
    return { value: null, message: t('main.files.notAnImage') };
  }
  try {
    const bytes = await readFile(source);
    if (bytes.length > options.maxBytes) {
      return { value: null, message: options.tooLarge };
    }
    return { value: `data:${type};base64,${bytes.toString('base64')}`, message: '' };
  } catch (error) {
    return { value: null, message: reasonFor(error, t('main.files.readFailed')) };
  }
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

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
    // Exports are passwords, history and bookmarks; the mode only applies when the file is created, hence the chmod.
    await writeFile(filePath, contents(), { encoding: 'utf8', mode: 0o600 });
    if (process.platform !== 'win32') {
      await chmod(filePath, 0o600);
    }
    return { value: true, message: '' };
  } catch (error) {
    return { value: null, message: reasonFor(error, t('main.files.writeFailed')) };
  }
}

/** Today, as the date a file written now should carry in its name. */
export function fileStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
