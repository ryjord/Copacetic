import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

import { idFromKey, isExtensionId, verifyWebStoreCrx } from '../../../../electron/main/extensions/crx';
import { isSafeEntryName, readZip } from '../../../../electron/main/extensions/zip';

// Protobuf, only as far as a CRX header uses it.
const varint = (value: number): Buffer => {
  const bytes: number[] = [];
  let rest = value;
  do {
    bytes.push((rest & 0x7f) | (rest > 0x7f ? 0x80 : 0));
    rest = Math.floor(rest / 128);
  } while (rest > 0);
  return Buffer.from(bytes);
};
const field = (number: number, value: Buffer) => Buffer.concat([varint(number * 8 + 2), varint(value.length), value]);

/** A zip with one stored and one deflated file, built by hand as the reader expects them. */
function zipOf(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text], index) => {
    const data = Buffer.from(text);
    const method = index % 2 === 0 ? 0 : 8;
    const stored = method === 0 ? data : deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(stored.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, stored);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + stored.length;
  });
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const keyPair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { der: publicKey.export({ format: 'der', type: 'spki' }), privateKey };
};

/** A CRX3 signed by a developer key and a stand-in for the store's. */
function crxOf(archive: Buffer, signers = { developer: keyPair(), publisher: keyPair() }) {
  const id = idFromKey(signers.developer.der);
  const idBytes = Buffer.from(
    [...id].reduce<number[]>((bytes, letter, index) => {
      const half = letter.charCodeAt(0) - 97;
      return index % 2 === 0 ? [...bytes, half << 4] : [...bytes.slice(0, -1), (bytes.at(-1) ?? 0) | half];
    }, []),
  );
  const signedHeaderData = field(1, idBytes);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signedHeaderData.length);
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'latin1'), length, signedHeaderData, archive]);
  const proof = (signer: ReturnType<typeof keyPair>) =>
    field(3, Buffer.concat([field(1, signer.der), field(2, sign('sha256', signed, signer.privateKey))]));
  const header = Buffer.concat([proof(signers.developer), proof(signers.publisher), field(10000, signedHeaderData)]);
  const prefix = Buffer.alloc(12);
  prefix.write('Cr24', 0, 'latin1');
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  const publisherHash = createHash('sha256').update(signers.publisher.der).digest('hex');
  return { file: Buffer.concat([prefix, header, archive]), id, publisherHash };
}

describe('a CRX from the store', () => {
  const archive = zipOf({ 'manifest.json': '{"manifest_version":3}', 'js/worker.js': 'console.log(1)' });

  it('is accepted when every signature holds and its key gives the id asked for', () => {
    const { file, id, publisherHash } = crxOf(archive);
    const verified = verifyWebStoreCrx(file, id, publisherHash);
    expect(verified.id).toBe(id);
    expect(readZip(verified.archive).map((entry) => entry.name)).toEqual(['manifest.json', 'js/worker.js']);
  });

  it('is refused when the store did not sign it', () => {
    const { file, id } = crxOf(archive);
    expect(() => verifyWebStoreCrx(file, id)).toThrow(/not signed by the Chrome Web Store/);
  });

  it('is refused when one byte of it changed', () => {
    const { file, id, publisherHash } = crxOf(archive);
    file.writeUInt8(file.readUInt8(file.length - 30) ^ 1, file.length - 30);
    expect(() => verifyWebStoreCrx(file, id, publisherHash)).toThrow(/signature does not check out/);
  });

  it('is refused when it is a different extension from the one asked for', () => {
    const { file, publisherHash } = crxOf(archive);
    expect(() => verifyWebStoreCrx(file, 'a'.repeat(32), publisherHash)).toThrow(/different extension/);
  });

  it('is refused when it is not a CRX at all', () => {
    expect(() => verifyWebStoreCrx(Buffer.from('PK\x03\x04 not a crx'), 'a'.repeat(32))).toThrow(
      /not a Chrome extension/,
    );
  });
});

describe('a name inside an extension', () => {
  it.each(['manifest.json', 'js/worker.js', '_locales/en/messages.json'])('keeps %s', (name) => {
    expect(isSafeEntryName(name)).toBe(true);
  });

  it.each(['../escape.js', '/etc/passwd', 'C:/Windows/x.dll', 'a/../../b', 'back\\slash', 'a//b'])(
    'refuses %s',
    (name) => {
      expect(isSafeEntryName(name)).toBe(false);
    },
  );

  it('refuses the whole archive when one name climbs out', () => {
    expect(() => readZip(zipOf({ 'manifest.json': '{}', '../escape.js': 'x' }))).toThrow(/outside its own folder/);
  });
});

it('knows an id when it sees one', () => {
  expect(isExtensionId('eimadpbcbfnmbkopoojfekhnkhdbieeh')).toBe(true);
  expect(isExtensionId('eimadpbcbfnmbkopoojfekhnkhdbiee')).toBe(false);
  expect(isExtensionId('zimadpbcbfnmbkopoojfekhnkhdbieeh')).toBe(false);
});
