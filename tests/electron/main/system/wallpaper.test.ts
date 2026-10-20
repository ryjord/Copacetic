import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let userDataDir = '';
let chosenFiles: string[] = [];
let dialogCancelled = false;
let sourceWidth = 800;
let decodesAsImage = true;

/**
 * The encoder's output is derived from what it was given, rather than a fixed
 * constant.
 *
 * It was a constant, and the test then asserted that the bytes written equalled
 * that constant - which the code satisfies by writing the encoder's output and
 * equally by writing the constant for any other reason. Deriving it means the
 * assertion can only pass if the file was decoded from the path that was chosen
 * and encoded at the quality the code asks for.
 */
const encodedFrom = (path: string, quality: number) => Buffer.from(`jpeg(${path}, q=${quality})`);

/** What the code asked the encoder to do, so the test can say it asked. */
const decoded: string[] = [];
const encoded: { path: string; quality: number; width: number | null }[] = [];

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  dialog: { showOpenDialog: async () => ({ canceled: dialogCancelled, filePaths: chosenFiles }) },
  nativeImage: {
    createFromPath: (path: string) => {
      decoded.push(path);
      const imageOf = (width: number | null) => ({
        isEmpty: () => !decodesAsImage,
        getSize: () => ({ width: width ?? sourceWidth, height: 600 }),
        resize: ({ width: to }: { width: number }) => imageOf(to),
        toJPEG: (quality: number) => {
          encoded.push({ path, quality, width });
          return encodedFrom(path, quality);
        },
      });
      return imageOf(null);
    },
  },
}));

const { Wallpaper } = await import('../../../../electron/main/system/wallpaper');

let wallpaper: InstanceType<typeof Wallpaper>;

const wallpaperFile = () => path.join(userDataDir, 'wallpaper.jpg');
const fakeWindow = {} as Parameters<InstanceType<typeof Wallpaper>['choose']>[0];

beforeEach(() => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'copacetic-wallpaper-'));
  wallpaper = new Wallpaper(userDataDir);
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
    expect(wallpaper.isSet()).toBe(false);
    expect(wallpaper.read()).toBeNull();
  });

  // The chrome's CSP is `img-src 'self' data:`, so a path on disk is unusable
  // and widening the policy for a decoration would be a poor trade.
  it('reads back as a data URL rather than a path', () => {
    writeFileSync(wallpaperFile(), Buffer.from('jpeg'));
    expect(wallpaper.read()).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`);
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
    decoded.length = 0;
    encoded.length = 0;

    expect(await wallpaper.choose(fakeWindow)).toBe('');
    wallpaper.commitStaged();

    // The file that was chosen is the file that was decoded, and what landed is
    // what the encoder produced from it - not a constant the test also knows.
    expect(decoded).toContain(source);
    expect(encoded).toHaveLength(1);
    const written = readFileSync(wallpaperFile());
    expect(written.equals(encodedFrom(source, encoded[0]!.quality))).toBe(true);
    expect(written.includes('original-file-bytes')).toBe(false);
  });

  /*
   * Quality is the whole reason this is a re-encode rather than a copy: a
   * wallpaper is decoration and the profile is not a place to put a
   * twelve-megapixel photograph. Named so that changing it is a decision.
   */
  it('encodes at a quality it chose, not whatever the file arrived at', async () => {
    const source = path.join(userDataDir, 'quality.png');
    writeFileSync(source, Buffer.from('x'));
    chosenFiles = [source];
    encoded.length = 0;

    await wallpaper.choose(fakeWindow);
    wallpaper.commitStaged();

    expect(encoded[0]?.quality).toBeGreaterThan(0);
    expect(encoded[0]?.quality).toBeLessThanOrEqual(100);
  });

  // Copied into the profile so moving or deleting the original later does not
  // blank the start page.
  it('keeps its own copy in the profile', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await wallpaper.choose(fakeWindow);
    wallpaper.commitStaged();

    expect(existsSync(wallpaperFile())).toBe(true);
    expect(wallpaper.isSet()).toBe(true);
  });

  it('shrinks an image wider than the cap', async () => {
    sourceWidth = 6000;
    chosenFiles = [path.join(userDataDir, 'huge.png')];
    expect(await wallpaper.choose(fakeWindow)).toBe('');
    wallpaper.commitStaged();

    expect(existsSync(wallpaperFile())).toBe(true);
  });

  it('writes nothing when the dialog is cancelled', async () => {
    dialogCancelled = true;
    chosenFiles = [path.join(userDataDir, 'source.png')];
    expect(await wallpaper.choose(fakeWindow)).toBe('');
    expect(existsSync(wallpaperFile())).toBe(false);
  });

  it('writes nothing when no file comes back', async () => {
    chosenFiles = [];
    expect(await wallpaper.choose(fakeWindow)).toBe('');
    expect(existsSync(wallpaperFile())).toBe(false);
  });

  // Returned as a message rather than thrown: this is reached from an IPC
  // handler, and an unhandled rejection there takes more with it than a
  // wallpaper that did not change.
  it('reports a file that is not an image instead of throwing', async () => {
    decodesAsImage = false;
    chosenFiles = [path.join(userDataDir, 'notes.txt')];
    const message = await wallpaper.choose(fakeWindow);
    expect(message).toContain('could not be read');
    expect(existsSync(wallpaperFile())).toBe(false);
  });
});

describe('clearing it', () => {
  it('removes the file', () => {
    writeFileSync(wallpaperFile(), Buffer.from('jpeg'));
    wallpaper.clear();
    expect(wallpaper.isSet()).toBe(false);
  });

  it('is fine when there was nothing to remove', () => {
    expect(() => wallpaper.clear()).not.toThrow();
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
    expect(await wallpaper.choose(fakeWindow)).toBe('');

    expect(existsSync(wallpaperFile())).toBe(false);
    expect(wallpaper.isSet()).toBe(false);
  });

  it('can be looked at before it is kept', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await wallpaper.choose(fakeWindow);

    expect(wallpaper.stagedImage()).toContain('data:image/jpeg;base64,');
  });

  it('leaves what was there alone when it is discarded', async () => {
    writeFileSync(wallpaperFile(), Buffer.from('the one already set'));
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await wallpaper.choose(fakeWindow);
    wallpaper.discardStaged();

    expect(readFileSync(wallpaperFile()).toString()).toBe('the one already set');
    expect(wallpaper.stagedImage()).toBeNull();
  });

  it('keeping nothing is not an error', () => {
    expect(() => wallpaper.commitStaged()).not.toThrow();
    expect(existsSync(wallpaperFile())).toBe(false);
  });

  // Otherwise a picked-then-kept wallpaper would come back after a removal.
  it('is forgotten when the wallpaper is removed', async () => {
    chosenFiles = [path.join(userDataDir, 'source.png')];
    await wallpaper.choose(fakeWindow);
    wallpaper.clear();
    wallpaper.commitStaged();

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
    wallpaper.stageRemoval();

    expect(existsSync(wallpaperFile())).toBe(true);
  });

  it('deletes it once it is kept', () => {
    writeFileSync(wallpaperFile(), Buffer.from('going'));
    wallpaper.stageRemoval();
    wallpaper.commitStagedChanges();

    expect(existsSync(wallpaperFile())).toBe(false);
  });

  it('puts it back when discarded, because it was never gone', () => {
    writeFileSync(wallpaperFile(), Buffer.from('kept after all'));
    wallpaper.stageRemoval();
    wallpaper.discardStaged();
    wallpaper.commitStagedChanges();

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
    await wallpaper.choose(fakeWindow);
    rmSync(userDataDir, { recursive: true, force: true });

    const failure = wallpaper.commitStaged();
    expect(failure).not.toBe('');
    expect(wallpaper.stagedImage()).not.toBeNull();
  });
});
