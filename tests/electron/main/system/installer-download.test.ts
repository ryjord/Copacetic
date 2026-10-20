import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeVerified } from '../../../../electron/main/system/installer-download';

const INSTALLER = new TextEncoder().encode('the published installer');
const PUBLISHED = { sha512: createHash('sha512').update(INSTALLER).digest('base64'), size: INSTALLER.length };

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function existingTarget(): string {
  const target = path.join(mkdtempSync(path.join(tmpdir(), 'copacetic-installer-')), 'Copacetic.dmg');
  writeFileSync(target, 'already here');
  return target;
}

describe('writeVerified', () => {
  it('saves the file once it matches what was published', async () => {
    const target = existingTarget();
    await writeVerified(streamOf(INSTALLER), target, PUBLISHED, () => {});
    expect(readFileSync(target)).toEqual(Buffer.from(INSTALLER));
    expect(existsSync(`${target}.part`)).toBe(false);
  });

  it('leaves a file already there alone when the download does not match', async () => {
    const target = existingTarget();
    const tampered = new TextEncoder().encode('the published installeR');
    await expect(writeVerified(streamOf(tampered), target, PUBLISHED, () => {})).rejects.toThrow();
    expect(readFileSync(target, 'utf8')).toBe('already here');
    expect(existsSync(`${target}.part`)).toBe(false);
  });

  it('stops once the download runs past its stated size', async () => {
    const target = existingTarget();
    const percents: number[] = [];
    const endless = streamOf(INSTALLER, INSTALLER, INSTALLER);
    await expect(writeVerified(endless, target, PUBLISHED, (percent) => percents.push(percent))).rejects.toThrow();
    expect(percents).toEqual([100]);
    expect(readFileSync(target, 'utf8')).toBe('already here');
  });
});
