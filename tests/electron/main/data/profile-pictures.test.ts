import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ nativeImage: {} }));

const { headerSize, isTooLargeToDecode } = await import('../../../../electron/main/data/profile-pictures');

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  header.writeUInt32BE(0x89504e47, 0);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpeg(width: number, height: number): Buffer {
  const application = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const frame = Buffer.alloc(11);
  frame.writeUInt16BE(0xffc0, 0);
  frame.writeUInt16BE(9, 2);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), application, frame]);
}

const dataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`;

describe('a picture read before it is decoded', () => {
  it('reads the size a PNG or a JPEG states', () => {
    expect(headerSize(png(640, 480))).toEqual({ width: 640, height: 480 });
    expect(headerSize(jpeg(1200, 800))).toEqual({ width: 1200, height: 800 });
    expect(headerSize(Buffer.from('GIF89a'))).toBeNull();
  });

  it('refuses one too large to decode', () => {
    expect(isTooLargeToDecode(dataUrl(png(8192, 8192)))).toBe(false);
    expect(isTooLargeToDecode(dataUrl(png(60_000, 100)))).toBe(true);
    expect(isTooLargeToDecode(dataUrl(jpeg(100, 9000)))).toBe(true);
  });
});
