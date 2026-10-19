/** What Remote Settings says about one file of one model. */
export interface ModelRecord {
  fromLang: string;
  toLang: string;
  fileType: string;
  version: string;
  filter_expression?: string;
  attachment: { location: string; size: number; hash: string; filename: string };
}

export type ModelFileKind = 'model' | 'lex' | 'vocab' | 'srcvocab' | 'trgvocab';

/** The files one model needs, each from the same newest version this engine can run. */
export interface ModelFiles {
  version: string;
  files: Partial<Record<ModelFileKind, ModelRecord['attachment']>>;
}

// The engine is browsermt's 2022 build; it runs Mozilla's 1.x and 2.x models and nothing is known of later ones.
const NEWEST_RUNNABLE_MAJOR = 2;
const KINDS: readonly ModelFileKind[] = ['model', 'lex', 'vocab', 'srcvocab', 'trgvocab'];

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(aVersion: string, bVersion: string): boolean {
  const aParts = versionParts(aVersion);
  const bParts = versionParts(bVersion);
  const index = aParts.findIndex((part, position) => part !== (bParts[position] ?? 0));
  return index !== -1 && (aParts[index] ?? 0) > (bParts[index] ?? 0);
}

export function isModelRecord(value: unknown): value is ModelRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record: Record<string, unknown> = { ...value };
  const attachment: unknown = record.attachment;
  if (typeof attachment !== 'object' || attachment === null) {
    return false;
  }
  const file: Record<string, unknown> = { ...attachment };
  return (
    typeof record.fromLang === 'string' &&
    typeof record.toLang === 'string' &&
    typeof record.fileType === 'string' &&
    typeof record.version === 'string' &&
    typeof file.location === 'string' &&
    typeof file.size === 'number' &&
    typeof file.hash === 'string' &&
    typeof file.filename === 'string'
  );
}

/**
 * The files to fetch for one direction, or null when no complete set exists.
 *
 * Records limited to some platforms (Android, a Nightly cohort) are skipped,
 * and a version is taken only when it has a model, its shortlist and its
 * vocabulary, so the set never mixes two versions.
 */
export function modelFilesFor(records: readonly ModelRecord[], from: string, to: string): ModelFiles | null {
  const usable = records.filter(
    (record) =>
      record.fromLang === from &&
      record.toLang === to &&
      !record.filter_expression &&
      (versionParts(record.version)[0] ?? 0) <= NEWEST_RUNNABLE_MAJOR,
  );
  const versions = [...new Set(usable.map((record) => record.version))].toSorted((aVersion, bVersion) =>
    isNewer(aVersion, bVersion) ? -1 : 1,
  );
  for (const version of versions) {
    const files = Object.fromEntries(
      usable
        .filter((record) => record.version === version)
        .flatMap((record) => {
          const kind = KINDS.find((candidate) => candidate === record.fileType);
          return kind ? [[kind, record.attachment]] : [];
        }),
    );
    const hasVocabulary = 'vocab' in files || ('srcvocab' in files && 'trgvocab' in files);
    if ('model' in files && 'lex' in files && hasVocabulary) {
      return { version, files };
    }
  }
  return null;
}
