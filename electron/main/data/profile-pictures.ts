// Libs
import { nativeImage } from 'electron';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Utils
import { describeError, log } from '../system/diagnostics';

const PICTURE_FILE = 'picture.png';
// Twice the largest size it is drawn at, for a sharp picture on a high-density screen.
const PICTURE_SIZE = 128;

/** A chosen photo, cut to its centred square and made small, so a picture costs a few kilobytes however large it was. */
export function squarePicture(dataUrl: string): Buffer | null {
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) {
    return null;
  }
  const { width, height } = image.getSize();
  const side = Math.min(width, height);
  return image
    .crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
    .resize({ width: PICTURE_SIZE, height: PICTURE_SIZE, quality: 'best' })
    .toPNG();
}

export function writePicture(directory: string, png: Buffer): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, PICTURE_FILE), png);
}

/** The picture as a data URL, read from the profile's own folder: nothing about it is ever fetched. */
export function readPicture(directory: string): string | null {
  try {
    return `data:image/png;base64,${readFileSync(path.join(directory, PICTURE_FILE)).toString('base64')}`;
  } catch {
    return null;
  }
}

export function removePicture(directory: string): void {
  try {
    rmSync(path.join(directory, PICTURE_FILE), { force: true });
  } catch (error) {
    log.warn('could not remove a profile picture', describeError(error));
  }
}
