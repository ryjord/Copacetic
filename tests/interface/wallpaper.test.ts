import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let userDataDir = '';
let chosenFiles: string[] = [];
let dialogCancelled = false;
let sourceWidth = 800;
let decodesAsImage = true;

const RE_ENCODED = Buffer.from('re-encoded-jpeg-bytes');

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  dialog: { showOpenDialog: async () => ({ canceled: dialogCancelled, filePaths: chosenFiles }) },
  nativeImage: {
    createFromPath: () => ({
      isEmpty: () => !decodesAsImage,
      getSize: () => ({ width: sourceWidth, height: 600 }),
      resize: ({ width }: { width: number }) => ({
        isEmpty: () => false,
        getSize: () => ({ width, height: 600 }),
        toJPEG: () => RE_ENCODED,
      }),
      toJPEG: () => RE_ENCODED,
    }),
  },
}));

const {
  chooseWallpaper,
  clearWallpaper,
  commitStagedChanges,
  commitStagedWallpaper,
  discardStagedWallpaper,
  hasWallpaper,
  readWallpaper,
  stageWallpaperRemoval,
  stagedWallpaper,
} = await import('../../electron/main/system/wallpaper');

const wallpaperFile = () => path.join(userDataDir, 'wallpaper.jpg');
const fakeWindow = {} as Parameters<typeof chooseWallpaper>[0];

beforeEach(() => {
  discardStagedWallpaper();
  userDataDir = mkdtempSync(path.join(tmpdir(), 'copacetic-wallpaper-'));
  chosenFiles = [];
  dialogCancelled = false;
  sourceWidth = 800;
  decodesAsImage = true;
});

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

describe('reading a wallpaper that may not be there', () => {
  it('reports none when nothing is set', () => {
    expect(hasWallpaper()).toBe(false);
    expect(readWallpaper()).toBeNull();
  });

  // The chrome's CSP is `img-src 'self' data:`, so a path on disk is unusable
  // and widening the policy for a decoration would be a poor trade.
  it('reads back as a data URL rather than a path', () => {
    writeFileSync(wallpaperFile(), Buffer.from('jpeg'));
    expect(readWallpaper()).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`);
  });
});

describe('choosing one', () => {
  /**
   * The chosen file is decoded and re-encoded rather than copied. That is what
   * makes an arbitrary file safe to sit behind the start page: whatever the user
   * picked, what lands in the profile is a JPEG this process produced, without
   * the original's bytes or metadata.
   */
  it('writes re-encoded bytes, never a copy of the file chosen', async () => {
    const source = path.join(userDataDir, 'source.png');
    writeFileSync(source, Buffer.from('original-file-bytes-with-metadata'));
    chosenFiles = [source];

    expect(await chooseWallpaper(fakeWindow)).toBe('');
    commitStagedWallpaper();

    const written = readFileSync(wallpaperFile());
    expect(written.equals(RE_ENCODED)).toBe(true);
    expect(written.includes('original-file-bytes')).toBe(false);
  });

  // Copied into the profile so moving or deleting the original later does not
  // blank the start page.
  it('keeps its own copy in the profile', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await chooseWallpaper(fakeWindow);
    commitStagedWallpaper();

    expect(existsSync(wallpaperFile())).toBe(true);
    expect(hasWallpaper()).toBe(true);
  });

  it('shrinks an image wider than the cap', async () => {
    sourceWidth = 6000;
    chosenFiles = [path.join(userDataDir, 'huge.png')];
    expect(await chooseWallpaper(fakeWindow)).toBe('');
    commitStagedWallpaper();

    expect(existsSync(wallpaperFile())).toBe(true);
  });

  it('writes nothing when the dialog is cancelled', async () => {
    dialogCancelled = true;
    chosenFiles = [path.join(userDataDir, 'source.png')];
    expect(await chooseWallpaper(fakeWindow)).toBe('');
    expect(existsSync(wallpaperFile())).toBe(false);
  });

  it('writes nothing when no file comes back', async () => {
    chosenFiles = [];
    expect(await chooseWallpaper(fakeWindow)).toBe('');
    expect(existsSync(wallpaperFile())).toBe(false);
  });

  // Returned as a message rather than thrown: this is reached from an IPC
  // handler, and an unhandled rejection there takes more with it than a
  // wallpaper that did not change.
  it('reports a file that is not an image instead of throwing', async () => {
    decodesAsImage = false;
    chosenFiles = [path.join(userDataDir, 'notes.txt')];
    const message = await chooseWallpaper(fakeWindow);
    expect(message).toContain('could not be read');
    expect(existsSync(wallpaperFile())).toBe(false);
  });
});

describe('clearing it', () => {
  it('removes the file', () => {
    writeFileSync(wallpaperFile(), Buffer.from('jpeg'));
    clearWallpaper();
    expect(hasWallpaper()).toBe(false);
  });

  it('is fine when there was nothing to remove', () => {
    expect(() => clearWallpaper()).not.toThrow();
  });
});

/**
 * The rest of the appearance pane shows a change before it is saved. A
 * wallpaper that wrote itself the moment it was picked was the one thing there
 * that could not be taken back.
 */
describe('a wallpaper waits to be kept', () => {
  it('writes nothing when it is only picked', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    expect(await chooseWallpaper(fakeWindow)).toBe('');

    expect(existsSync(wallpaperFile())).toBe(false);
    expect(hasWallpaper()).toBe(false);
  });

  it('can be looked at before it is kept', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await chooseWallpaper(fakeWindow);

    expect(stagedWallpaper()).toContain('data:image/jpeg;base64,');
  });

  it('leaves what was there alone when it is discarded', async () => {
    writeFileSync(wallpaperFile(), Buffer.from('the one already set'));
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await chooseWallpaper(fakeWindow);
    discardStagedWallpaper();

    expect(readFileSync(wallpaperFile()).toString()).toBe('the one already set');
    expect(stagedWallpaper()).toBeNull();
  });

  it('keeping nothing is not an error', () => {
    expect(() => commitStagedWallpaper()).not.toThrow();
    expect(existsSync(wallpaperFile())).toBe(false);
  });

  // Otherwise a picked-then-kept wallpaper would come back after a removal.
  it('is forgotten when the wallpaper is removed', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await chooseWallpaper(fakeWindow);
    clearWallpaper();
    commitStagedWallpaper();

    expect(existsSync(wallpaperFile())).toBe(false);
  });
});

/**
 * Removing was the one action on a pane promising nothing is kept until you
 * keep it that deleted a file outright, with no way back.
 */
describe('removing one also waits', () => {
  it('leaves the file alone until it is kept', () => {
    writeFileSync(wallpaperFile(), Buffer.from('still here'));
    stageWallpaperRemoval();

    expect(existsSync(wallpaperFile())).toBe(true);
  });

  it('deletes it once it is kept', () => {
    writeFileSync(wallpaperFile(), Buffer.from('going'));
    stageWallpaperRemoval();
    commitStagedChanges();

    expect(existsSync(wallpaperFile())).toBe(false);
  });

  it('puts it back when discarded, because it was never gone', () => {
    writeFileSync(wallpaperFile(), Buffer.from('kept after all'));
    stageWallpaperRemoval();
    discardStagedWallpaper();
    commitStagedChanges();

    expect(readFileSync(wallpaperFile()).toString()).toBe('kept after all');
  });
});

/**
 * Reporting a draft as kept while dropping the picture is the worst outcome
 * available, so a failed write says so and holds on to it.
 */
describe('when it cannot be written', () => {
  it('says why, and keeps what was picked', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await chooseWallpaper(fakeWindow);
    rmSync(userDataDir, { recursive: true, force: true });

    const failure = commitStagedWallpaper();
    expect(failure).not.toBe('');
    expect(stagedWallpaper()).not.toBeNull();
  });
});
