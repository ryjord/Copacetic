import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const showOpenDialog = vi.fn();
const showSaveDialog = vi.fn();
const readFile = vi.fn();
const writeFile = vi.fn();

vi.mock('electron', () => ({ dialog: { showOpenDialog, showSaveDialog } }));
vi.mock('node:fs/promises', () => ({ readFile, writeFile, default: { readFile, writeFile } }));

const { readChosenFile, writeChosenFile, fileStamp } = await import('../../electron/main/app/file-dialogs');

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

  // They know they just cancelled, so telling them would be noise.
  it('says nothing when the dialog is cancelled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    expect(await readChosenFile(window, openOptions)).toEqual({ value: null, message: '' });
    expect(readFile).not.toHaveBeenCalled();
  });

  // Cancelling on some platforms reports no path rather than a cancel.
  it('treats an empty selection as a cancellation', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });

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

  it('still says something when what was thrown was not an error', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.csv'] });
    readFile.mockRejectedValue('nope');

    expect((await readChosenFile(window, openOptions)).message).toBe('The file could not be read.');
  });
});

describe('choosing where to write a file', () => {
  it('reports success once it is written', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' });
    writeFile.mockResolvedValue(undefined);

    expect(await writeChosenFile(window, saveOptions, () => 'body')).toEqual({ value: true, message: '' });
    expect(writeFile).toHaveBeenCalledWith('/tmp/out.csv', 'body', 'utf8');
  });

  it('says nothing when the dialog is cancelled', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    expect(await writeChosenFile(window, saveOptions, () => 'body')).toEqual({ value: null, message: '' });
  });

  // The whole history is serialised to produce these, so doing it for a dialog
  // nobody accepted is work done for nothing.
  it('does not produce the contents until somewhere has been chosen', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    const contents = vi.fn(() => 'body');

    await writeChosenFile(window, saveOptions, contents);

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

  it('still says something when what was thrown was not an error', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' });
    writeFile.mockRejectedValue('nope');

    expect((await writeChosenFile(window, saveOptions, () => 'body')).message).toBe('The file could not be written.');
  });
});

describe('the date a file carries in its name', () => {
  it('is the day, without the time', () => {
    expect(fileStamp(Date.UTC(2026, 7, 21, 15, 4, 5))).toBe('2026-08-21');
  });
});
