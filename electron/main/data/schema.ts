import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { REAL_DISK } from './durable-write';
import { describeError, log } from '../system/diagnostics';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** One step, taking a file written at `to - 1` and returning it at `to`. */
export interface Migration {
  to: number;
  /** Said in the log when it runs, so an upgrade that goes wrong can be read back. */
  describe: string;
  up(raw: unknown): unknown;
}

export interface SchemaPlan {
  /** The version this build of the app writes. */
  current: number;
  steps: readonly Migration[];
}

/** A file nothing has ever migrated is version 1: every file predates this system. */
export const FIRST_VERSION = 1;

export const UNVERSIONED: SchemaPlan = { current: FIRST_VERSION, steps: [] };

export type MigrationOutcome =
  | { status: 'current'; data: unknown }
  | { status: 'migrated'; data: unknown; from: number; applied: readonly string[] }
  /**
   * Written by a build newer than this one. Guessing at a shape from the future
   * is how data gets destroyed, so this is a refusal rather than an attempt.
   */
  | { status: 'from-a-newer-version'; found: number };

/**
 * A plan has to describe an unbroken path from the first version to the one this
 * build writes. A gap means an upgrade would silently skip a step, so it is a
 * programming mistake worth failing loudly for rather than a runtime condition.
 */
export function assertUsablePlan(plan: SchemaPlan, name = 'plan'): void {
  const versions = plan.steps.map((step) => step.to);
  const expected = Array.from({ length: plan.current - FIRST_VERSION }, (_, index) => index + FIRST_VERSION + 1);
  if (versions.length !== expected.length || versions.some((version, index) => version !== expected[index])) {
    throw new Error(
      `${name}: steps must run ${expected.join(', ') || '(none)'} to reach version ${plan.current}, but they are ${versions.join(', ') || '(none)'}`,
    );
  }
}

/** Bring `raw`, written at version `from`, up to the version this build writes. */
export function migrate(raw: unknown, from: number, plan: SchemaPlan): MigrationOutcome {
  assertUsablePlan(plan);

  if (from > plan.current) {
    return { status: 'from-a-newer-version', found: from };
  }
  if (from === plan.current) {
    return { status: 'current', data: raw };
  }

  const applied: string[] = [];
  let data = raw;
  for (const step of plan.steps) {
    if (step.to > from) {
      data = step.up(data);
      applied.push(step.describe);
    }
  }
  return { status: 'migrated', data, from, applied };
}

/**
 * Which version each file on disk was last written at, kept beside them rather
 * than inside them. Three of these files hold a bare array at the top level with
 * nowhere to put a version, and keeping it outside means a build that predates
 * this still reads every file exactly as it always did.
 */
export class SchemaVersions {
  private readonly filePath: string;
  private versions: Record<string, number>;

  constructor(private readonly dir: string) {
    this.filePath = path.join(dir, 'schema.json');
    this.versions = this.load();
  }

  private load(): Record<string, number> {
    if (!existsSync(this.filePath)) {
      return {};
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return {};
      }
      const versions: Record<string, number> = {};
      for (const [name, value] of Object.entries(raw)) {
        if (typeof value === 'number' && Number.isInteger(value) && value >= FIRST_VERSION) {
          versions[name] = value;
        }
      }
      return versions;
    } catch {
      // Losing this means every file is treated as the first version and every
      // step runs again over data that has already had it. That is only safe
      // because each step is required to recognise its own output and return it
      // untouched — see the idempotence test, which runs every step twice.
      return {};
    }
  }

  versionOf(filename: string): number {
    return this.versions[filename] ?? FIRST_VERSION;
  }

  record(filename: string, version: number): void {
    if (this.versions[filename] === version) {
      return;
    }
    this.versions[filename] = version;
    this.write();
  }

  /**
   * Writes the record of what version each file is at.
   *
   * Through the same durable path as the data it describes: flushed to the disk
   * before the rename, readable only by its owner, and retried when something
   * else is holding the file. It was written the plain way, which made the note
   * saying how to read the files less safe than the files — the wrong way round.
   *
   * A failure here is reported rather than swallowed. It used to be caught and
   * dropped, so a data file could reach version N with the record still saying
   * N-1 and nothing anywhere would mention it. That state is survivable, because
   * every migration step is required to recognise its own output and is tested
   * by being run twice — but survivable is not the same as unremarkable.
   */
  private write(): void {
    const tempPath = `${this.filePath}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      if (!existsSync(this.dir)) {
        mkdirSync(this.dir, { recursive: true });
      }
      REAL_DISK.write(tempPath, JSON.stringify(this.versions));
      REAL_DISK.rename(tempPath, this.filePath);
    } catch (error) {
      console.error('[schema] could not record file versions', error);
      log.error('the record of file versions could not be written', describeError(error));
      try {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      } catch {
        /* best effort */
      }
    }
  }
}

const byDirectory = new Map<string, SchemaVersions>();

/** One record per profile directory, shared by every file in it. */
export function schemaVersionsFor(dir: string): SchemaVersions {
  const existing = byDirectory.get(dir);
  if (existing) {
    return existing;
  }
  const created = new SchemaVersions(dir);
  byDirectory.set(dir, created);
  return created;
}

/** Only for tests, which use a fresh directory per case. */
export function forgetSchemaVersions(): void {
  byDirectory.clear();
}
