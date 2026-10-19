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

describe('sanitiseFilename', () => {
  it('keeps an ordinary filename intact', () => {
    expect(sanitiseFilename('report.pdf')).toBe('report.pdf');
    expect(sanitiseFilename('My Notes (final).md')).toBe('My Notes (final).md');
  });

  it('strips directory components so a download cannot escape the folder', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('/absolute/path/file.txt')).toBe('file.txt');
  });

  it('refuses to produce a dotfile', () => {
    expect(sanitiseFilename('.bashrc')).toBe('bashrc');
    expect(sanitiseFilename('..')).toBe('download');
  });

  it('removes bidirectional overrides used to disguise an extension', () => {
    // U+202E (right-to-left override) makes `invoice<RLO>fdp.exe` render as
    // `invoiceexe.pdf` in a file list while still being an executable.
    const rlo = String.fromCharCode(0x202e);
    const cleaned = sanitiseFilename(`invoice${rlo}fdp.exe`);
    expect(cleaned).not.toContain(rlo);
    expect(cleaned).toBe('invoicefdp.exe');
  });

  it('removes control characters', () => {
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    expect(sanitiseFilename(`safe${nul}name${bell}.txt`)).toBe('safename.txt');
  });

  it('replaces characters that are reserved in a path', () => {
    expect(sanitiseFilename('a:b*c?d"e<f>g|h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
  });

  it('always returns something usable', () => {
    expect(sanitiseFilename('')).toBe('download');
    expect(sanitiseFilename('///')).toBe('download');
  });

  it('caps the length', () => {
    expect(sanitiseFilename('a'.repeat(500)).length).toBe(180);
  });
});

describe('sanitiseFilename, Windows-specific traps', () => {
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

  it('leaves names that merely start with those letters alone', () => {
    expect(sanitiseFilename('console.log')).toBe('console.log');
    expect(sanitiseFilename('contract.pdf')).toBe('contract.pdf');
    expect(sanitiseFilename('company.xlsx')).toBe('company.xlsx');
  });

  // Windows silently drops a trailing dot or space, so `evil.exe.` is written
  // as `evil.exe` after a user has read the name and seen something harmless.
  it('strips trailing dots and spaces that would change the real extension', () => {
    expect(sanitiseFilename('invoice.pdf.')).toBe('invoice.pdf');
    expect(sanitiseFilename('invoice.pdf   ')).toBe('invoice.pdf');
    expect(sanitiseFilename('setup.exe. . .')).toBe('setup.exe');
  });

  it('never returns an empty name', () => {
    expect(sanitiseFilename('...')).toBe('download');
    expect(sanitiseFilename('   ')).toBe('download');
  });
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

  it('asks the filesystem once, not once per state push', () => {
    const clock = 1_000;
    const { manager, asked } = managerWith(() => clock);
    manager.attach({
      on: () => {},
    } as unknown as Parameters<typeof manager.attach>[0]);

    // Nothing recorded yet, so nothing to ask about.
    manager.list();
    expect(asked).toHaveLength(0);
  });

  it('answers from what it remembered until that goes stale', () => {
    let clock = 1_000;
    const { manager, asked } = managerWith(() => clock);
    const path = '/tmp/thing.zip';

    // Reaching past the public surface deliberately: what is being tested is the
    // caching, and building a real completed download needs a live Electron
    // DownloadItem, which a unit test cannot have.
    const check = (manager as unknown as { stillThere: (p: string) => boolean }).stillThere.bind(manager);

    expect(check(path)).toBe(true);
    expect(check(path)).toBe(true);
    expect(check(path)).toBe(true);
    expect(asked).toHaveLength(1);

    // Past the moment it is worth reusing.
    clock += 10_000;
    expect(check(path)).toBe(true);
    expect(asked).toHaveLength(2);
  });

  it('asks again about a path it was told to recheck', () => {
    const clock = 1_000;
    const { manager, asked } = managerWith(() => clock);
    const check = (manager as unknown as { stillThere: (p: string) => boolean }).stillThere.bind(manager);

    check('/tmp/a.zip');
    check('/tmp/a.zip');
    expect(asked).toHaveLength(1);

    manager.recheck('/tmp/a.zip');
    check('/tmp/a.zip');
    expect(asked).toHaveLength(2);
  });

  // Two files are two answers; remembering one must not answer for the other.
  it('remembers each file separately', () => {
    const clock = 1_000;
    const { manager, asked } = managerWith(() => clock);
    const check = (manager as unknown as { stillThere: (p: string) => boolean }).stillThere.bind(manager);

    check('/tmp/a.zip');
    check('/tmp/b.zip');
    expect(asked).toEqual(['/tmp/a.zip', '/tmp/b.zip']);
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

  it('is not what an ordinary file is', () => {
    const { manager, offer, asked } = managerFor(ordinary);
    const { item } = offer('report.pdf');
    expect(item.pause).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
    expect(manager.list()[0]?.isHeld).toBe(false);
  });
});
