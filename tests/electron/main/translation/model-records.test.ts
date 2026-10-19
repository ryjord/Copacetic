import { describe, expect, it } from 'vitest';
import { modelFilesFor, type ModelRecord } from '../../../../electron/main/translation/model-records';

const record = (fileType: string, version: string, over: Partial<ModelRecord> = {}): ModelRecord => ({
  fromLang: 'fr',
  toLang: 'en',
  fileType,
  version,
  attachment: { location: `${fileType}-${version}`, size: 1, hash: 'h', filename: `${fileType}.bin` },
  ...over,
});

describe('modelFilesFor', () => {
  it('takes the newest version that is complete', () => {
    const chosen = modelFilesFor(
      [
        record('model', '1.0'),
        record('lex', '1.0'),
        record('vocab', '1.0'),
        record('model', '2.1'),
        record('lex', '2.1'),
        record('vocab', '2.1'),
      ],
      'fr',
      'en',
    );
    expect(chosen?.version).toBe('2.1');
    expect(chosen?.files.model?.location).toBe('model-2.1');
  });

  it('passes over a version missing a file rather than mixing two', () => {
    const chosen = modelFilesFor(
      [record('model', '1.0'), record('lex', '1.0'), record('vocab', '1.0'), record('model', '2.0')],
      'fr',
      'en',
    );
    expect(chosen?.version).toBe('1.0');
  });

  it('takes separate source and target vocabularies as a whole vocabulary', () => {
    const chosen = modelFilesFor(
      [record('model', '1.0'), record('lex', '1.0'), record('srcvocab', '1.0'), record('trgvocab', '1.0')],
      'fr',
      'en',
    );
    expect(chosen?.files.srcvocab && chosen.files.trgvocab).toBeTruthy();
  });

  it('skips records meant for another platform, and versions this engine cannot run', () => {
    const android = { filter_expression: "env.appinfo.OS == 'Android'" };
    expect(
      modelFilesFor(
        [record('model', '2.0', android), record('lex', '2.0', android), record('vocab', '2.0', android)],
        'fr',
        'en',
      ),
    ).toBeNull();
    expect(
      modelFilesFor([record('model', '3.0'), record('lex', '3.0'), record('vocab', '3.0')], 'fr', 'en'),
    ).toBeNull();
  });
});
