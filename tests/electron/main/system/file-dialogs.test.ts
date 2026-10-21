import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const showOpenDialog = vi.fn();
const showSaveDialog = vi.fn();
const readFile = vi.fn();
const writeFile = vi.fn();
const chmod = vi.fn();

vi.mock('electron', () => ({ dialog: { showOpenDialog, showSaveDialog } }));
vi.mock('node:fs/promises', () => ({ readFile, writeFile, chmod, default: { readFile, writeFile, chmod } }));

const { readChosenFile, writeChosenFile } = await import('../../../../electron/main/system/file-dialogs');

const window = {} as BrowserWindow;
const openOptions = { title: 'Import', filters: [{ name: 'Any', extensions: ['csv'] }] };
const saveOptions = { title: 'Export', defaultPath: 'out.csv', filters: [{ name: 'Any', extensions: ['csv'] }] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('choosing a file to read', () => {
  it('hands back what was in it', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.csv'] });
    readFile.mockResolvedValue('url,password');

    expect(await readChosenFile(window, openOptions)).toEqual({ value: 'url,password', message: '' });
  });

  // They know they just cancelled, so telling them would be noise. Some platforms report no path rather than a cancel.
  it.each([
    ['the dialog is cancelled', { canceled: true, filePaths: [] }],
    ['the selection is empty', { canceled: false, filePaths: [] }],
  ])('says nothing when %s', async (_name, dialogResult) => {
    showOpenDialog.mockResolvedValue(dialogResult);

    expect(await readChosenFile(window, openOptions)).toEqual({ value: null, message: '' });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('passes on why the file could not be read', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.csv'] });
    readFile.mockRejectedValue(new Error('EACCES: permission denied'));

    expect(await readChosenFile(window, openOptions)).toEqual({
      value: null,
      message: 'EACCES: permission denied',
    });
  });
});

describe('choosing where to write a file', () => {
  it('reports success once it is written', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' });
    writeFile.mockResolvedValue(undefined);

    expect(await writeChosenFile(window, saveOptions, () => 'body')).toEqual({ value: true, message: '' });
    expect(writeFile).toHaveBeenCalledWith('/tmp/out.csv', 'body', { encoding: 'utf8', mode: 0o600 });
  });

  // The whole history is serialised to produce these, so doing it for a dialog nobody accepted is work done for nothing.
  it('says nothing, and does not produce the contents, when the dialog is cancelled', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    const contents = vi.fn(() => 'body');

    expect(await writeChosenFile(window, saveOptions, contents)).toEqual({ value: null, message: '' });
    expect(contents).not.toHaveBeenCalled();
  });

  it('passes on why the file could not be written', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' });
    writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'));

    expect(await writeChosenFile(window, saveOptions, () => 'body')).toEqual({
      value: null,
      message: 'ENOSPC: no space left on device',
    });
  });

  it.each([
    [
      'read',
      'The file could not be read.',
      async () => {
        showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.csv'] });
        readFile.mockRejectedValue('nope');
        return (await readChosenFile(window, openOptions)).message;
      },
    ],
    [
      'written',
      'The file could not be written.',
      async () => {
        showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' });
        writeFile.mockRejectedValue('nope');
        return (await writeChosenFile(window, saveOptions, () => 'body')).message;
      },
    ],
  ])(
    'still says something when what was thrown was not an error and the file could not be %s',
    async (_name, expected, attempt) => {
      expect(await attempt()).toBe(expected);
    },
  );
});

// A password export is the vault in plain text; on a shared machine 0644 hands it to every account.
describe('the file an export writes', () => {
  it.skipIf(process.platform === 'win32')(
    'is readable by its owner alone, even when it replaces another',
    async () => {
      showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' });
      writeFile.mockResolvedValue(undefined);
      chmod.mockResolvedValue(undefined);

      await writeChosenFile(window, saveOptions, () => 'body');
      expect(chmod).toHaveBeenCalledWith('/tmp/out.csv', 0o600);
    },
  );
});
