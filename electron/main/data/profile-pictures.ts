// Libs
import { nativeImage } from 'electron';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Utils
import { describeError, log } from '../system/diagnostics';

const PICTURE_FILE = 'picture.png';
// Twice the largest size it is drawn at, for a sharp picture on a high-density screen.
const PICTURE_SIZE = 128;

// Far more than a picture drawn at 64 points needs; past it, decoding alone could take gigabytes in the main process.
const MOST_PIXELS_A_SIDE = 8192;

/** Whether a PNG or JPEG says it is too large to decode, read from its header before anything is decoded. */
export function isTooLargeToDecode(dataUrl: string): boolean {
  const size = headerSize(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  return size !== null && Math.max(size.width, size.height) > MOST_PIXELS_A_SIDE;
}

/** Width and height as a PNG or JPEG header states them; null for anything else, which nativeImage cannot read. */
export function headerSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    // Start-of-frame markers carry the size; C4, C8 and CC share the range without being frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += marker === 0xff ? 1 : 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}

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
