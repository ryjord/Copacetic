import { app, dialog, nativeImage, type BrowserWindow } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A picture behind the start page.

/** Wide enough for any display this will run on, small enough to stay sane. */
const MAX_WIDTH = 2560;
/** Visibly lossless at wallpaper scale, and a fraction of a PNG. */
const JPEG_QUALITY = 82;

function wallpaperPath(): string {
  return path.join(app.getPath('userData'), 'wallpaper.jpg');
}

export function hasWallpaper(): boolean {
  return existsSync(wallpaperPath());
}

/** Read back as a data URL because the chrome's CSP is `img-src 'self' data:` — it cannot load a file from disk, and widening that for a decoration would be a poor trade. */
export function readWallpaper(): string | null {
  const file = wallpaperPath();
  if (!existsSync(file)) {
    return null;
  }
  try {
    return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Wide enough to judge a picture by, small enough not to weigh Settings down. */
const PREVIEW_WIDTH = 480;

/** A small version, for showing what is set without loading the whole thing. */
export function readWallpaperPreview(): string | null {
  const file = wallpaperPath();
  if (!existsSync(file)) {
    return null;
  }
  try {
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) {
      return null;
    }
    const preview = image.getSize().width > PREVIEW_WIDTH ? image.resize({ width: PREVIEW_WIDTH }) : image;
    return `data:image/jpeg;base64,${preview.toJPEG(75).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Ask for an image and keep a copy. */
/**
 * A wallpaper someone has picked but not yet kept.
 *
 * The rest of the appearance pane shows a change before it is saved, and a
 * wallpaper that wrote itself to disk the moment it was chosen was the one
 * thing on that pane that could not be taken back. It waits here instead, and
 * is written only when the rest of the draft is.
 */
let staged: Buffer | null = null;

export function stagedWallpaper(): string | null {
  return staged ? `data:image/jpeg;base64,${staged.toString('base64')}` : null;
}

export function discardStagedWallpaper(): void {
  staged = null;
}

/** Writes what was staged. Nothing staged means nothing to do, not an error. */
export function commitStagedWallpaper(): void {
  if (!staged) {
    return;
  }
  try {
    writeFileSync(wallpaperPath(), staged);
  } catch {
    // The pane reports what it can see; a failure here leaves the old one in place.
  }
  staged = null;
}

export async function chooseWallpaper(window: BrowserWindow): Promise<string> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Choose a wallpaper',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
  });

  const source = filePaths[0];
  if (canceled || !source) {
    return '';
  }

  try {
    let image = nativeImage.createFromPath(source);
    if (image.isEmpty()) {
      return 'That file could not be read as an image.';
    }

    const { width } = image.getSize();
    if (width > MAX_WIDTH) {
      image = image.resize({ width: MAX_WIDTH, quality: 'good' });
    }

    const encoded = image.toJPEG(JPEG_QUALITY);
    if (encoded.length === 0) {
      return 'That image could not be converted.';
    }

    staged = encoded;
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'The wallpaper could not be saved.';
  }
}

export function clearWallpaper(): void {
  staged = null;
  try {
    rmSync(wallpaperPath(), { force: true });
  } catch {
    // Already gone is the outcome we wanted.
  }
}
