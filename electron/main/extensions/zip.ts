// Libs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

// Utils
import { t } from '../../shared/i18n/translate';

// Bitwarden unpacks to under 80 MB; this is several times the largest extension in the store.
export const MOST_UNPACKED_BYTES = 512 * 1024 * 1024;
const MOST_ENTRIES = 50_000;

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Every file in a zip archive, read with only Node's own zlib.
 *
 * An extension is code from somewhere else, so each name is checked before
 * anything is written: one that climbs out of its folder, is absolute, or
 * names a Windows drive is a refusal of the whole archive, and so is one that
 * would unpack past a sane size.
 */
export function readZip(archive: Buffer): ZipEntry[] {
  const end = findEndOfDirectory(archive);
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  if (count > MOST_ENTRIES) {
    throw new Error(t('main.extensions.install.tooLarge'));
  }
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== DIRECTORY_ENTRY) {
      throw new Error(t('main.extensions.install.notAnExtension'));
    }
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    // Zip64 marks its sizes this way, and nothing an extension needs is that large.
    if (compressedSize === 0xffffffff || size === 0xffffffff) {
      throw new Error(t('main.extensions.install.tooLarge'));
    }
    total += size;
    if (total > MOST_UNPACKED_BYTES) {
      throw new Error(t('main.extensions.install.tooLarge'));
    }
    if (name.endsWith('/')) {
      continue;
    }
    if (!isSafeEntryName(name)) {
      throw new Error(t('main.extensions.install.unsafePath'));
    }
    if (archive.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new Error(t('main.extensions.install.notAnExtension'));
    }
    const dataStart =
      localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    entries.push({ name, data: unpack(method, compressed, size) });
  }
  return entries;
}

/** Writes what readZip found into a folder of its own, which must not exist yet. */
export function writeEntries(entries: readonly ZipEntry[], directory: string): void {
  mkdirSync(directory, { recursive: true });
  const root = path.resolve(directory);
  entries.forEach((entry) => {
    const target = path.resolve(root, entry.name);
    // Checked again where it lands, in case a name that read safely resolves otherwise on this system.
    if (!target.startsWith(root + path.sep)) {
      throw new Error(t('main.extensions.install.unsafePath'));
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
  });
}

export function isSafeEntryName(name: string): boolean {
  if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    return false;
  }
  return name.split('/').every((part) => part !== '..' && part !== '.' && part !== '');
}

function unpack(method: number, compressed: Buffer, size: number): Buffer {
  if (method === STORED) {
    if (compressed.length !== size) {
      throw new Error(t('main.extensions.install.notAnExtension'));
    }
    return Buffer.from(compressed);
  }
  if (method === DEFLATED) {
    // Bounded by the size the directory states, so a small entry cannot inflate into a huge one.
    const data = inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    if (data.length !== size) {
      throw new Error(t('main.extensions.install.notAnExtension'));
    }
    return data;
  }
  throw new Error(t('main.extensions.install.notAnExtension'));
}

function findEndOfDirectory(archive: Buffer): number {
  // The record is at least 22 bytes from the end, and its comment can push it back by up to 65535 more.
  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_DIRECTORY) {
      return offset;
    }
  }
  throw new Error(t('main.extensions.install.notAnExtension'));
}
