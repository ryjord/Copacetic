import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ session: { fromPartition: () => ({}) } }));

const { ATTACHMENTS_URL, RECORDS_URL, TranslationModels } =
  await import('../../../../electron/main/translation/translation-models');

const files = { model: Buffer.from('model bytes'), lex: Buffer.from('shortlist'), vocab: Buffer.from('vocabulary') };
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const records = Object.entries(files).map(([fileType, body]) => ({
  fromLang: 'fr',
  toLang: 'en',
  fileType,
  version: '2.0',
  attachment: { location: `files/${fileType}`, size: body.length, hash: sha(body), filename: `${fileType}.bin` },
}));

const fakeMozilla = (overrides: Record<string, Buffer> = {}) => {
  const asked: string[] = [];
  return {
    asked,
    bytes: async (url: string) => {
      asked.push(url);
      if (url === RECORDS_URL) {
        return Buffer.from(JSON.stringify({ data: records }));
      }
      const kind = url.slice(`${ATTACHMENTS_URL}files/`.length);
      return overrides[kind] ?? files[kind as keyof typeof files];
    },
  };
};

describe('translation models', () => {
  it('downloads a direction once, and reads it from disk after', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-models-'));
    const mozilla = fakeMozilla();
    const first = await new TranslationModels(directory, mozilla).buffersFor({ from: 'fr', to: 'en' });
    expect(first.model.toString()).toBe('model bytes');
    expect(first.vocabs).toHaveLength(1);

    const later = fakeMozilla();
    await new TranslationModels(directory, later).buffersFor({ from: 'fr', to: 'en' });
    expect(later.asked).toEqual([RECORDS_URL]);
    expect(new TranslationModels(directory, later).installedBytes()).toBeGreaterThan(0);
  });

  it('refuses a file that is not what Mozilla published, and keeps nothing of it', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-models-'));
    const tampered = fakeMozilla({ model: Buffer.from('model bytez') });
    await expect(new TranslationModels(directory, tampered).buffersFor({ from: 'fr', to: 'en' })).rejects.toThrow(
      /did not arrive as Mozilla published it/,
    );
    expect(new TranslationModels(directory, tampered).installedBytes()).toBeLessThan(files.model.length * 3);
  });

  it('says so when no model translates a direction', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-models-'));
    await expect(
      new TranslationModels(directory, fakeMozilla()).buffersFor({ from: 'de', to: 'en' }),
    ).rejects.toThrow(/No model/);
  });
});
