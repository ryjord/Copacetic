#!/usr/bin/env node
/**
 * Fetches the filter lists this browser ships with.
 *
 * Deliberately a script someone runs, not something the app does on a timer.
 * Every other blocker fetches its lists in the background on a schedule, which
 * is a periodic request from your machine to a server — the shape of the thing
 * being blocked. Copacetic ships the list inside the app, so updating it is a
 * commit someone made and a release someone cut, and the rules that are running
 * can be read in this repository.
 *
 * Run it with `npm run filters:update`. The result is a diff.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCES = [
  {
    name: 'easylist',
    url: 'https://easylist.to/easylist/easylist.txt',
    describe: 'Advertising. The list most blockers are built on.',
  },
  {
    name: 'easyprivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    describe: 'Tracking and analytics, separate from advertising.',
  },
];

const OUT = path.join(process.cwd(), 'electron', 'main', 'security', 'filters');

/** The first lines of a list say when it was made, which is what the interface shows. */
function versionOf(text) {
  const stamp = /^! Last modified: (.+)$/m.exec(text);
  const version = /^! Version: (.+)$/m.exec(text);
  return { lastModified: stamp?.[1]?.trim() ?? null, version: version?.[1]?.trim() ?? null };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const lists = [];

  for (const source of SOURCES) {
    process.stdout.write(`fetching ${source.name}… `);
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`${source.url} answered ${response.status}`);
    }
    const text = await response.text();
    // A list that arrived truncated would silently shrink what is blocked, and
    // nothing downstream would notice: it parses, it just stops less.
    if (text.length < 100_000 || !text.startsWith('[Adblock')) {
      throw new Error(`${source.name} does not look like a filter list (${text.length} bytes)`);
    }

    writeFileSync(path.join(OUT, `${source.name}.txt`), text);
    lists.push({
      name: source.name,
      url: source.url,
      describe: source.describe,
      bytes: text.length,
      rules: text.split('\n').filter((line) => line && !line.startsWith('!')).length,
      sha256: createHash('sha256').update(text).digest('hex'),
      ...versionOf(text),
    });
    process.stdout.write(`${(text.length / 1048576).toFixed(1)} MB\n`);
  }

  const manifest = { fetchedAt: new Date().toISOString(), lists };
  writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nWrote ${lists.length} lists and a manifest to ${path.relative(process.cwd(), OUT)}.`);
  console.log('Commit the diff: what changed is what this browser will block.');
}

await main();
