import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// `downloads.ts` imports electron for its manager class; the two pure helpers
// under test do not touch it, so a minimal stub keeps the import graph happy.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, shell: {} }));

const { DownloadManager, sanitiseFilename } = await import('../../../../electron/main/data/downloads');
const { DownloadsTable } = await import('../../../../electron/main/data/downloads-table');
const { openDatabase } = await import('../../../../electron/main/data/database');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-downloads-'));
});
const openTable = () => new DownloadsTable(openDatabase(path.join(dir, 'copacetic.db')), dir);

const rightToLeftOverride = String.fromCharCode(0x202e);
const nul = String.fromCharCode(0);
const bell = String.fromCharCode(7);

describe('sanitiseFilename', () => {
  it.each([
    { name: 'keeps an ordinary filename intact', input: 'report.pdf', expected: 'report.pdf' },
    { name: 'keeps spaces and brackets', input: 'My Notes (final).md', expected: 'My Notes (final).md' },
    { name: 'strips a relative directory climb', input: '../../etc/passwd', expected: 'passwd' },
    { name: 'strips an absolute path', input: '/absolute/path/file.txt', expected: 'file.txt' },
    { name: 'refuses to produce a dotfile', input: '.bashrc', expected: 'bashrc' },
    { name: 'turns a bare parent reference into a default name', input: '..', expected: 'download' },
    // U+202E makes `invoice<RLO>fdp.exe` render as `invoiceexe.pdf` in a file list while still being an executable.
    {
      name: 'removes a bidirectional override used to disguise an extension',
      input: `invoice${rightToLeftOverride}fdp.exe`,
      expected: 'invoicefdp.exe',
    },
    { name: 'removes control characters', input: `safe${nul}name${bell}.txt`, expected: 'safename.txt' },
    {
      name: 'replaces characters that are reserved in a path',
      input: 'a:b*c?d"e<f>g|h.txt',
      expected: 'a_b_c_d_e_f_g_h.txt',
    },
    { name: 'falls back for an empty name', input: '', expected: 'download' },
    { name: 'falls back for nothing but separators', input: '///', expected: 'download' },
    { name: 'caps the length', input: 'a'.repeat(500), expected: 'a'.repeat(180) },
    { name: 'leaves console.log alone', input: 'console.log', expected: 'console.log' },
    { name: 'leaves contract.pdf alone', input: 'contract.pdf', expected: 'contract.pdf' },
    { name: 'leaves company.xlsx alone', input: 'company.xlsx', expected: 'company.xlsx' },
    // Windows drops a trailing dot or space, so `evil.exe.` would be written as `evil.exe`.
    { name: 'strips a trailing dot', input: 'invoice.pdf.', expected: 'invoice.pdf' },
    { name: 'strips trailing spaces', input: 'invoice.pdf   ', expected: 'invoice.pdf' },
    { name: 'strips alternating trailing dots and spaces', input: 'setup.exe. . .', expected: 'setup.exe' },
    { name: 'falls back for nothing but dots', input: '...', expected: 'download' },
    { name: 'falls back for nothing but spaces', input: '   ', expected: 'download' },
  ])('$name', ({ input, expected }) => {
    const result = sanitiseFilename(input);
    expect(result).toBe(expected);
    expect(result).not.toContain(rightToLeftOverride);
  });
});

describe('sanitiseFilename, Windows device names', () => {
  // Windows resolves these to devices, not files, in any directory and with
  // any extension. `CON.txt` talks to the console rather than creating a file.
  it.each(['CON', 'con.txt', 'PRN', 'aux.log', 'NUL', 'COM1', 'com9.dat', 'LPT1', 'lpt9.pdf'])(
    'defuses the reserved device name %s',
    (name) => {
      const result = sanitiseFilename(name);
      expect(result).toBe(`_${name}`);
      expect(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(result)).toBe(false);
    },
  );
});

/**
 * `list` is built inside every state push, and a state push happens on almost
 * anything: a tab title arriving, a page finishing, a download ticking. Asking
 * the filesystem about every completed download each time meant hundreds of
 * synchronous stat calls a second on the main thread - for an answer that
 * changes when someone moves a file, which is not something they do hundreds of
 * times a second.
 */
describe('checking whether a downloaded file is still there', () => {
  const managerWith = (now: () => number) => {
    const asked: string[] = [];
    const manager = new DownloadManager(
      () => {},
      openTable(),
      now,
      (savePath: string) => {
        asked.push(savePath);
        return true;
      },
    );
    return { manager, asked };
  };

  it('asks the filesystem once per path, again after it goes stale, again after recheck(), and per file', () => {
    let clock = 1_000;
    const { manager, asked } = managerWith(() => clock);
    // Reaching past the public surface deliberately: what is being tested is the
    // caching, and building a real completed download needs a live Electron
    // DownloadItem, which a unit test cannot have.
    const check = (manager as unknown as { stillThere: (savePath: string) => boolean }).stillThere.bind(manager);

    expect(check('/tmp/thing.zip')).toBe(true);
    expect(check('/tmp/thing.zip')).toBe(true);
    expect(check('/tmp/thing.zip')).toBe(true);
    expect(asked).toHaveLength(1);

    clock += 10_000;
    expect(check('/tmp/thing.zip')).toBe(true);
    expect(asked).toHaveLength(2);

    check('/tmp/thing.zip');
    expect(asked).toHaveLength(2);
    manager.recheck('/tmp/thing.zip');
    check('/tmp/thing.zip');
    expect(asked).toHaveLength(3);

    // Two files are two answers; remembering one must not answer for the other.
    check('/tmp/other.zip');
    expect(asked.slice(3)).toEqual(['/tmp/other.zip']);
  });
});

const download = (over: Record<string, unknown> = {}) => ({
  id: 'one',
  filename: 'report.pdf',
  savePath: '/Users/someone/Downloads/report.pdf',
  url: 'https://files.example/report.pdf',
  receivedBytes: 2048,
  totalBytes: 2048,
  status: 'completed',
  startedAt: 1_700_000_000_000,
  completedAt: 1_700_000_005_000,
  urlChain: ['https://example.com/get', 'https://files.example/report.pdf'],
  sha256: 'abc123',
  ...over,
});

describe('the downloads list on disk', () => {
  it('survives a restart with its route and checksum', () => {
    const table = openTable();
    table.update(() => [{ ...download(), bytesPerSecond: null, fileExists: true } as never]);
    table.flush();
    const [restored] = openTable().get();
    expect(restored?.urlChain).toEqual(['https://example.com/get', 'https://files.example/report.pdf']);
    expect(restored?.sha256).toBe('abc123');
    expect(restored?.completedAt).toBe(1_700_000_005_000);
  });

  // Many progress ticks a second are one write, not one each.
  it('writes a burst of changes once', () => {
    const table = openTable();
    Array.from({ length: 50 }, (_unused, index) =>
      table.update(() => [
        { ...download({ receivedBytes: index }), bytesPerSecond: null, fileExists: false } as never,
      ]),
    );
    expect(openTable().get()).toHaveLength(0);
    table.flush();
    expect(openTable().get()[0]?.receivedBytes).toBe(49);
  });

  it('brings in the downloads.json an earlier version kept, once', () => {
    writeFileSync(path.join(dir, 'downloads.json'), JSON.stringify([download()]));
    expect(
      openTable()
        .get()
        .map((entry) => entry.filename),
    ).toEqual(['report.pdf']);
    expect(existsSync(path.join(dir, 'downloads.json.imported'))).toBe(true);
    expect(existsSync(path.join(dir, 'downloads.json'))).toBe(false);
    expect(readFileSync(path.join(dir, 'downloads.json.imported'), 'utf8')).toContain('report.pdf');
  });
});

/** A session that hands over a download the way Electron does, and an item that can be finished from the test. */
function fakeDownloadSession() {
  let willDownload: ((event: unknown, item: unknown) => void) | null = null;
  const started: string[] = [];
  const session = {
    on: (_name: string, listener: (event: unknown, item: unknown) => void) => {
      willDownload = listener;
    },
    downloadURL: (url: string) => started.push(url),
  };
  const offer = (filename = 'report.pdf') => {
    const handlers: Record<string, (event: unknown, state: string) => void> = {};
    let savePath = '';
    const item = {
      getFilename: () => filename,
      getURL: () => `https://files.example/${filename}`,
      getURLChain: () => [`https://files.example/${filename}`],
      getTotalBytes: () => 10,
      getReceivedBytes: () => 10,
      isPaused: () => false,
      getSavePath: () => savePath,
      setSavePath: vi.fn((chosen: string) => (savePath = chosen)),
      setSaveDialogOptions: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      canResume: () => true,
      on: (name: string, handler: (event: unknown, state: string) => void) => (handlers[name] = handler),
      once: (name: string, handler: (event: unknown, state: string) => void) => (handlers[name] = handler),
    };
    willDownload?.({}, item);
    return {
      item,
      // What the save dialog would have done, for a download that asked.
      choose: (chosen: string) => (savePath = chosen),
      update: () => handlers.updated?.({}, 'progressing'),
      finish: (state: 'completed' | 'interrupted' | 'cancelled') => handlers.done?.({}, state),
    };
  };
  return { session, started, offer };
}

const managerFor = (preferences: { downloadDirectory: string | null; askWhereToSave: boolean }) => {
  const fake = fakeDownloadSession();
  const asked: string[] = [];
  const manager = new DownloadManager(
    () => {},
    openTable(),
    Date.now,
    existsSync,
    () => preferences,
    (download) => asked.push(download.filename),
  );
  manager.attach(fake.session as never);
  return { manager, asked, ...fake };
};

describe('where a download is saved', () => {
  it('goes to the folder chosen in Settings', () => {
    const { offer } = managerFor({ downloadDirectory: dir, askWhereToSave: false });
    const { item } = offer();
    expect(item.setSavePath).toHaveBeenCalledWith(path.join(dir, 'report.pdf'));
  });

  // A folder deleted or on a disk since unplugged must not fail every download after it.
  it('falls back to the Downloads folder when the chosen one has gone', () => {
    const { offer } = managerFor({ downloadDirectory: path.join(dir, 'not-there'), askWhereToSave: false });
    const { item } = offer();
    expect(item.setSavePath).toHaveBeenCalledWith(path.join('/tmp', 'report.pdf'));
  });

  it('asks where, and keeps the answer, when asking is turned on', () => {
    const { manager, offer } = managerFor({ downloadDirectory: null, askWhereToSave: true });
    const download = offer();
    expect(download.item.setSavePath).not.toHaveBeenCalled();
    expect(download.item.setSaveDialogOptions).toHaveBeenCalledWith({ defaultPath: path.join('/tmp', 'report.pdf') });
    download.choose(path.join(dir, 'renamed.pdf'));
    download.finish('completed');
    expect(manager.list()[0]).toMatchObject({ savePath: path.join(dir, 'renamed.pdf'), filename: 'renamed.pdf' });
  });
});

describe('trying a download again', () => {
  it('starts it again from where it came from, in place of the one that failed', () => {
    const { manager, offer, started } = managerFor({ downloadDirectory: null, askWhereToSave: false });
    offer().finish('interrupted');
    const [failed] = manager.list();
    manager.retry(failed!.id);
    expect(started).toEqual(['https://files.example/report.pdf']);
    expect(manager.list().some((entry) => entry.id === failed!.id)).toBe(false);
  });

  // After a restart the session object is gone, but which one it was is written down with the download.
  it('goes back to the session it came from after a restart', () => {
    const table = openTable();
    const first = new DownloadManager(() => {}, table, Date.now, existsSync);
    const grouped = fakeDownloadSession();
    first.attach(grouped.session as never, true, 'persist:copacetic-group-work');
    grouped.offer().finish('interrupted');
    table.flush();

    const restarted = new DownloadManager(() => {}, openTable(), Date.now, existsSync);
    const ordinary = fakeDownloadSession();
    restarted.attach(ordinary.session as never, true, 'persist:copacetic-web');
    const groupAgain = fakeDownloadSession();
    restarted.setSessionResolver((partition) =>
      partition === 'persist:copacetic-group-work' ? (groupAgain.session as never) : null,
    );
    restarted.retry(restarted.list()[0]!.id);
    expect(groupAgain.started).toEqual(['https://files.example/report.pdf']);
    expect(ordinary.started).toEqual([]);
  });

  // A finished download has nothing to try again, and starting it twice would be a second copy nobody asked for.
  it('leaves a completed download alone', () => {
    const { manager, offer, started } = managerFor({ downloadDirectory: null, askWhereToSave: false });
    offer().finish('completed');
    manager.retry(manager.list()[0]!.id);
    expect(started).toEqual([]);
  });
});

/** Most drive-by downloads are a program nobody meant to fetch, opened from the downloads list. */
describe('a file that runs when opened', () => {
  const ordinary = { downloadDirectory: null, askWhereToSave: false };

  it('is paused the moment it starts, and the person is asked', () => {
    const { manager, offer, asked } = managerFor(ordinary);
    const { item } = offer('setup.exe');
    expect(item.pause).toHaveBeenCalled();
    expect(asked).toEqual(['setup.exe']);
    expect(manager.list()[0]?.isHeld).toBe(true);
  });

  // Asked where to save, a person could rename notes.txt to notes.exe in the dialog and land it unheld.
  it('is held when it is renamed into one in the save dialog', () => {
    const { manager, offer, asked } = managerFor({ downloadDirectory: null, askWhereToSave: true });
    const download = offer('notes.txt');
    expect(manager.list()[0]?.isHeld).toBe(false);
    download.choose(path.join(dir, 'notes.exe'));
    download.update();
    expect(download.item.pause).toHaveBeenCalled();
    expect(manager.list()[0]).toMatchObject({ isHeld: true, filename: 'notes.exe' });
    expect(asked).toEqual(['notes.exe']);
  });

  it('does not ask again about a file already kept', () => {
    const { manager, offer, asked } = managerFor(ordinary);
    const download = offer('setup.exe');
    manager.keep(manager.list()[0]!.id);
    download.update();
    expect(asked).toEqual(['setup.exe']);
  });

  // Resuming past the question would make the question decoration.
  it('cannot be resumed past the question', () => {
    const { manager, offer } = managerFor(ordinary);
    const { item } = offer('setup.exe');
    manager.resume(manager.list()[0]!.id);
    expect(item.resume).not.toHaveBeenCalled();
  });

  it('carries on downloading once kept', () => {
    const { manager, offer } = managerFor(ordinary);
    const { item } = offer('setup.exe');
    manager.keep(manager.list()[0]!.id);
    expect(item.resume).toHaveBeenCalled();
    expect(manager.list()[0]?.isHeld).toBe(false);
  });

  it('is thrown away when discarded', () => {
    const { manager, offer } = managerFor(ordinary);
    const { item } = offer('setup.exe');
    manager.discard(manager.list()[0]!.id);
    expect(item.cancel).toHaveBeenCalled();
  });

  // The held check lowercases the last extension, so the casing and the stacking of a name must not slip a program past it.
  it.each([
    { name: 'an upper-case .EXE', filename: 'SETUP.EXE', isHeld: true },
    { name: 'a mixed-case .Exe', filename: 'Setup.Exe', isHeld: true },
    { name: 'a screensaver .scr', filename: 'holiday.scr', isHeld: true },
    { name: 'an upper-case .SCR', filename: 'HOLIDAY.SCR', isHeld: true },
    { name: 'a program hiding behind a document name', filename: 'invoice.pdf.exe', isHeld: true },
    { name: 'a script behind several extensions', filename: 'archive.tar.gz.sh', isHeld: true },
    { name: 'a program name with a harmless last extension', filename: 'setup.exe.txt', isHeld: false },
    { name: 'a file that is only the word exe', filename: 'exe', isHeld: false },
    { name: 'a document', filename: 'report.PDF', isHeld: false },
  ])('judges $name by its last extension', ({ filename, isHeld }) => {
    const { manager, offer, asked } = managerFor(ordinary);
    const { item } = offer(filename);
    expect(manager.list()[0]?.isHeld).toBe(isHeld);
    expect(asked).toEqual(isHeld ? [filename] : []);
    expect(item.pause.mock.calls.length > 0).toBe(isHeld);
  });

  it('is not what an ordinary file is', () => {
    const { manager, offer, asked } = managerFor(ordinary);
    const { item } = offer('report.pdf');
    expect(item.pause).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
    expect(manager.list()[0]?.isHeld).toBe(false);
  });
});

describe('a download that does not finish', () => {
  const ordinary = { downloadDirectory: null, askWhereToSave: false };

  // Electron removes the partial file itself; the manager must not present what is left as something to open.
  it.each(['interrupted', 'cancelled'] as const)(
    'is recorded as %s, with nothing to open and no speed',
    async (state) => {
      const { manager, offer } = managerFor(ordinary);
      const download = offer('report.pdf');
      download.update();
      download.finish(state);

      const [entry] = manager.list();
      expect(entry).toMatchObject({ status: state, bytesPerSecond: null, fileExists: false });
      expect(entry?.completedAt).not.toBeNull();
      await expect(manager.openFile(entry!.id)).resolves.not.toBe('');
    },
  );

  it.each(['interrupted', 'cancelled'] as const)('can be tried again once it has been %s', (state) => {
    const { manager, offer, started } = managerFor(ordinary);
    offer('report.pdf').finish(state);
    const [failed] = manager.list();
    manager.retry(failed!.id);
    expect(started).toEqual(['https://files.example/report.pdf']);
    expect(manager.list().some((entry) => entry.id === failed!.id)).toBe(false);
  });

  it('ignores a pause, a resume or a cancel once it has ended', () => {
    const { manager, offer } = managerFor(ordinary);
    const { item, finish } = offer('report.pdf');
    finish('interrupted');
    const [entry] = manager.list();
    manager.pause(entry!.id);
    manager.resume(entry!.id);
    manager.cancel(entry!.id);
    expect(item.pause).not.toHaveBeenCalled();
    expect(item.resume).not.toHaveBeenCalled();
    expect(item.cancel).not.toHaveBeenCalled();
  });

  it('is recorded as cancelled when a held file is thrown away', () => {
    const { manager, offer } = managerFor(ordinary);
    const download = offer('setup.exe');
    manager.discard(manager.list()[0]!.id);
    download.finish('cancelled');
    expect(manager.list()[0]).toMatchObject({ status: 'cancelled', fileExists: false });
  });
});

describe('forgetting a site', () => {
  it('removes the records that name it anywhere on the way, and leaves the rest', () => {
    const { manager, offer } = managerFor({ downloadDirectory: null, askWhereToSave: false });
    offer('report.pdf').finish('completed');
    expect(manager.countForSite('files.example')).toBe(1);
    expect(manager.forgetSite('files.example')).toBe(1);
    expect(manager.list()).toEqual([]);
    expect(manager.forgetSite('other.example')).toBe(0);
  });

  // One still downloading is not a record yet; forgetting must not cancel it silently.
  it('leaves a download still running', () => {
    const { manager, offer } = managerFor({ downloadDirectory: null, askWhereToSave: false });
    offer('report.pdf');
    expect(manager.forgetSite('files.example')).toBe(0);
    expect(manager.list()).toHaveLength(1);
  });
});
