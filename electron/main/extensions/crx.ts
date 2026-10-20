// Libs
import { createHash, createPublicKey, verify } from 'node:crypto';

// Utils
import { t } from '../../shared/i18n/translate';

/**
 * The Chrome Web Store's own key, as Chromium's CRX verifier pins it: every
 * extension the store serves is signed by it, so a file without its signature
 * did not come from the store, whatever its name says.
 */
export const WEB_STORE_PUBLISHER_KEY_HASH = '61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf';

const MAGIC = 'Cr24';
const SIGNED_DATA_PREFIX = Buffer.from('CRX3 SignedData\x00', 'latin1');

interface Proof {
  algorithm: 'sha256-rsa' | 'sha256-ecdsa';
  publicKey: Buffer;
  signature: Buffer;
}

export interface VerifiedCrx {
  /** The extension's id, worked out from its own key rather than taken from where it was fetched. */
  id: string;
  /** The developer's key, written back into the manifest so the extension keeps its store id here. */
  publicKey: Buffer;
  archive: Buffer;
}

/**
 * Reads a CRX3 file and refuses it unless every signature it carries is
 * sound, the store's is among them, and its own key gives the id that was
 * asked for. Throws with a sentence a person can be shown.
 */
export function verifyWebStoreCrx(
  file: Buffer,
  expectedId: string,
  publisherKeyHash = WEB_STORE_PUBLISHER_KEY_HASH,
): VerifiedCrx {
  if (file.length < 12 || file.toString('latin1', 0, 4) !== MAGIC || file.readUInt32LE(4) !== 3) {
    throw new Error(t('main.extensions.install.notAnExtension'));
  }
  const headerSize = file.readUInt32LE(8);
  if (12 + headerSize > file.length) {
    throw new Error(t('main.extensions.install.notAnExtension'));
  }
  const header = file.subarray(12, 12 + headerSize);
  const archive = file.subarray(12 + headerSize);
  const { proofs, signedHeaderData } = readHeader(header);
  const crxId = readCrxId(signedHeaderData);

  const signedLength = Buffer.alloc(4);
  signedLength.writeUInt32LE(signedHeaderData.length);
  const signed = Buffer.concat([SIGNED_DATA_PREFIX, signedLength, signedHeaderData, archive]);
  const isSound = (proof: Proof) => {
    try {
      const key = createPublicKey({ key: proof.publicKey, format: 'der', type: 'spki' });
      return verify('sha256', signed, key, proof.signature);
    } catch {
      return false;
    }
  };
  if (proofs.length === 0 || !proofs.every(isSound)) {
    throw new Error(t('main.extensions.install.badSignature'));
  }
  if (!proofs.some((proof) => sha256Hex(proof.publicKey) === publisherKeyHash)) {
    throw new Error(t('main.extensions.install.notFromStore'));
  }
  // The id is the developer's key, hashed: one of the keys must give the id in the signed header.
  const developer = proofs.find((proof) => idFromKey(proof.publicKey) === crxId);
  if (!developer || crxId !== expectedId) {
    throw new Error(t('main.extensions.install.wrongExtension'));
  }
  return { id: crxId, publicKey: developer.publicKey, archive };
}

/** Chrome's own spelling of an id: sixteen bytes, each half-byte a letter from a to p. */
function idFromBytes(bytes: Buffer): string {
  return [...bytes]
    .map((byte) => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 15)))
    .join('');
}

/** The id a key gives: the first sixteen bytes of its hash. */
export function idFromKey(publicKey: Buffer): string {
  return idFromBytes(createHash('sha256').update(publicKey).digest().subarray(0, 16));
}

export function isExtensionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-p]{32}$/.test(value);
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function readHeader(header: Buffer): { proofs: Proof[]; signedHeaderData: Buffer } {
  const proofs: Proof[] = [];
  let signedHeaderData: Buffer | null = null;
  for (const [field, value] of readFields(header)) {
    if ((field === 2 || field === 3) && Buffer.isBuffer(value)) {
      const parts = new Map(readFields(value));
      const publicKey = parts.get(1);
      const signature = parts.get(2);
      if (Buffer.isBuffer(publicKey) && Buffer.isBuffer(signature)) {
        proofs.push({ algorithm: field === 2 ? 'sha256-rsa' : 'sha256-ecdsa', publicKey, signature });
      }
    }
    if (field === 10000 && Buffer.isBuffer(value)) {
      signedHeaderData = value;
    }
  }
  if (!signedHeaderData) {
    throw new Error(t('main.extensions.install.notAnExtension'));
  }
  return { proofs, signedHeaderData };
}

function readCrxId(signedHeaderData: Buffer): string {
  const raw = new Map(readFields(signedHeaderData)).get(1);
  if (!Buffer.isBuffer(raw) || raw.length !== 16) {
    throw new Error(t('main.extensions.install.notAnExtension'));
  }
  return idFromBytes(raw);
}

/** The length-delimited and varint fields of one protobuf message; nothing else is used in a CRX header. */
function readFields(message: Buffer): [number, Buffer | number][] {
  const fields: [number, Buffer | number][] = [];
  let offset = 0;
  const readVarint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (offset >= message.length || shift > 35) {
        throw new Error(t('main.extensions.install.notAnExtension'));
      }
      const byte = message[offset] ?? 0;
      offset += 1;
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
      if ((byte & 0x80) === 0) {
        return result;
      }
    }
  };
  while (offset < message.length) {
    const key = readVarint();
    const field = Math.floor(key / 8);
    const wireType = key % 8;
    if (wireType === 2) {
      const length = readVarint();
      if (offset + length > message.length) {
        throw new Error(t('main.extensions.install.notAnExtension'));
      }
      fields.push([field, message.subarray(offset, offset + length)]);
      offset += length;
    } else if (wireType === 0) {
      fields.push([field, readVarint()]);
    } else {
      throw new Error(t('main.extensions.install.notAnExtension'));
    }
  }
  return fields;
}
