// Libs
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

// Utils
import { type ModelFileKind, type ModelRecord, isModelRecord, modelFilesFor } from './model-records';

// Types
import type { LanguagePair } from '../../shared/translation/languages';

export const RECORDS_URL =
  'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records';
export const ATTACHMENTS_URL = 'https://firefox-settings-attachments.cdn.mozilla.net/';
const MAX_RECORDS_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_FILE_BYTES = 120 * 1024 * 1024;

/** How the models are fetched, passed in so none of this needs a network to be tested. */
export interface ModelFetch {
  bytes(url: string, maxBytes: number): Promise<Buffer>;
}

/** What the engine is handed for one direction. */
export interface ModelBuffers {
  model: Buffer;
  shortlist: Buffer;
  vocabs: Buffer[];
}

/**
 * Mozilla's translation models, fetched only when someone translates and kept
 * in the profile after, so each direction is downloaded once.
 *
 * Every file is checked against the SHA-256 Mozilla publishes for it before it
 * is kept, so a file that arrived damaged, or from anywhere else, is never used.
 */
export class TranslationModels {
  private records: Promise<ModelRecord[]> | null = null;

  constructor(
    private readonly directory: string,
    private readonly fetchModel: ModelFetch,
  ) {}

  async buffersFor(pair: LanguagePair): Promise<ModelBuffers> {
    const found = modelFilesFor(await this.recordList(), pair.from, pair.to);
    if (!found) {
      throw new Error(`No model translates ${pair.from} into ${pair.to}.`);
    }
    const folder = path.join(this.directory, `${pair.from}-${pair.to}`, found.version);
    const read = async (kind: ModelFileKind) => {
      const file = found.files[kind];
      return file ? this.fileIn(folder, file) : null;
    };
    const [model, shortlist, vocab, sourceVocab, targetVocab] = await Promise.all(
      (['model', 'lex', 'vocab', 'srcvocab', 'trgvocab'] as const).map(read),
    );
    if (!model || !shortlist) {
      throw new Error(`The ${pair.from} to ${pair.to} model is incomplete.`);
    }
    const vocabs = vocab ? [vocab] : [sourceVocab, targetVocab].filter((entry): entry is Buffer => entry !== null);
    return { model, shortlist, vocabs };
  }

  /** What is kept on disk, for Settings to show and clear. */
  installedBytes(): number {
    if (!existsSync(this.directory)) {
      return 0;
    }
    const sizeOf = (folder: string): number =>
      readdirSync(folder, { withFileTypes: true }).reduce((total, entry) => {
        const full = path.join(folder, entry.name);
        return total + (entry.isDirectory() ? sizeOf(full) : statSync(full).size);
      }, 0);
    return sizeOf(this.directory);
  }

  removeAll(): void {
    rmSync(this.directory, { recursive: true, force: true });
  }

  private recordList(): Promise<ModelRecord[]> {
    // Asked once per run, and only once a translation was asked for.
    this.records ??= this.fetchModel
      .bytes(RECORDS_URL, MAX_RECORDS_BYTES)
      .then((body) => {
        const parsed: unknown = JSON.parse(body.toString('utf8'));
        const data = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'data') : null;
        return Array.isArray(data) ? data.filter(isModelRecord) : [];
      })
      .catch((error: unknown) => {
        this.records = null;
        throw error;
      });
    return this.records;
  }

  private async fileIn(folder: string, file: ModelRecord['attachment']): Promise<Buffer> {
    const target = path.join(folder, path.basename(file.filename));
    if (existsSync(target) && statSync(target).size === file.size) {
      return readFileSync(target);
    }
    if (file.size > MAX_MODEL_FILE_BYTES) {
      throw new Error(`${file.filename} is larger than any model should be.`);
    }
    const body = await this.fetchModel.bytes(`${ATTACHMENTS_URL}${file.location}`, MAX_MODEL_FILE_BYTES);
    const digest = createHash('sha256').update(body).digest('hex');
    if (body.length !== file.size || digest !== file.hash) {
      throw new Error(`${file.filename} did not arrive as Mozilla published it.`);
    }
    mkdirSync(folder, { recursive: true });
    const temporary = `${target}.partial`;
    writeFileSync(temporary, body);
    renameSync(temporary, target);
    return body;
  }
}
