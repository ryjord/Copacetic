import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKMARKS_PLAN } from '../../electron/main/data/bookmarks-store';
import { SESSION_PLAN } from '../../electron/main/data/session-store';
import type { SchemaPlan } from '../../electron/main/data/schema';

/**
 * Every migration step has to survive being run twice.
 *
 * The version record lives in its own file, and losing it is not exotic: an
 * interrupted write, a half-restored backup, or a profile copied without it all
 * produce a data directory whose files are current and whose recorded version
 * is gone. `versionOf` then reports the first version for everything and every
 * step runs again over data that has already had it.
 *
 * That was destructive rather than wasteful. Measured on the shipped 1.4.0
 * code: the session step re-run on its own output returned a session with no
 * tabs at all, and the bookmarks step un-filed every bookmark from every folder.
 * Neither raised anything — the file was rewritten, cleanly, empty.
 *
 * So idempotence is the contract, and this is where it is enforced.
 */

const PLANS: Record<string, SchemaPlan> = {
  'session.json': SESSION_PLAN,
  'bookmarks.json': BOOKMARKS_PLAN,
};

/** Shapes a step might meet: what it migrates from, and what it produces. */
const SAMPLES: Record<string, unknown[]> = {
  'session.json': [
    { urls: ['https://a.example/', 'https://b.example/'], activeIndex: 1 },
    { tabs: [{ url: 'https://a.example/', groupId: null }], activeIndex: 0 },
    { tabs: [], activeIndex: 0 },
    {},
  ],
  'bookmarks.json': [
    [{ id: '1', url: 'https://a.example/', title: 'A' }],
    [{ id: '1', url: 'https://a.example/', title: 'A', folderId: 'work' }],
    [{ id: '1', url: 'https://a.example/', title: 'A', folderId: null }],
    [],
  ],
};

describe('every migration step is idempotent', () => {
  for (const [file, plan] of Object.entries(PLANS)) {
    for (const step of plan.steps) {
      for (const [index, sample] of (SAMPLES[file] ?? []).entries()) {
        it(`${file} step to v${step.to} on sample ${index} is unchanged by a second run`, () => {
          const once = step.up(structuredClone(sample));
          const twice = step.up(structuredClone(once));
          expect(twice).toEqual(once);
        });
      }
    }
  }

  /*
   * The specific loss, named rather than left to the general case: a second run
   * over already-migrated data used to return an empty tab list, which is how
   * someone's open tabs disappeared.
   */
  it('does not empty a session that has already been migrated', () => {
    const migrated = { tabs: [{ url: 'https://a.example/', groupId: null }], activeIndex: 0 };
    const step = SESSION_PLAN.steps.find((candidate) => candidate.to === 2);
    expect(step).toBeDefined();
    expect(step?.up(migrated)).toEqual(migrated);
  });

  it('does not un-file bookmarks that are already filed', () => {
    const migrated = [{ id: '1', url: 'https://a.example/', title: 'A', folderId: 'work' }];
    const step = BOOKMARKS_PLAN.steps.find((candidate) => candidate.to === 2);
    expect(step?.up(migrated)).toEqual(migrated);
  });

  /*
   * A plan added later and never listed above would make all of this pass while
   * testing nothing, so the count is checked against the source. If this fails,
   * a new SchemaPlan exists: add it to PLANS with samples either side of its
   * step, rather than raising the number.
   */
  it('covers every plan in the data folder', () => {
    const directory = path.join(process.cwd(), 'electron', 'main', 'data');
    const declared = readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.ts'))
      .flatMap((name) => {
        const source = readFileSync(path.join(directory, name), 'utf8');
        // Both spellings: the annotated form and `satisfies`, which is the same
        // declaration and would otherwise walk straight past this check.
        return [
          ...source.matchAll(/export const (\w+)(?::\s*SchemaPlan\s*=|\s*=[\s\S]{0,400}?satisfies SchemaPlan)/g),
        ].map((match) => match[1]);
      })
      // UNVERSIONED is the empty plan every unmigrated file uses; it has no steps.
      .filter((name) => name !== 'UNVERSIONED');

    expect([...new Set(declared)].sort()).toEqual(['BOOKMARKS_PLAN', 'SESSION_PLAN']);
  });

  /*
   * The check above only says a plan is listed in PLANS. A plan listed there
   * with no samples produces no `it()` at all — a green run that tested nothing,
   * which is the failure mode this whole file exists to prevent.
   */
  it('has samples for every plan it covers', () => {
    for (const file of Object.keys(PLANS)) {
      expect(SAMPLES[file] ?? []).not.toHaveLength(0);
    }
  });

  // And every plan's steps are actually reached, rather than a plan with an
  // empty `steps` array quietly contributing nothing.
  it('has at least one step to run twice', () => {
    for (const [file, plan] of Object.entries(PLANS)) {
      expect(plan.steps.length, `${file} has no migration steps`).toBeGreaterThan(0);
    }
  });
});
