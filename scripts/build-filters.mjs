#!/usr/bin/env node
/**
 * Turns the filter lists in the repository into the form the app loads.
 *
 * Parsing 138,000 rules from text costs about 320ms; deserializing the same
 * rules from the engine's own format costs about 10ms. That difference is paid
 * at every launch, so it is paid here instead, once, at build time.
 *
 * The text is what lives in the repository, because a rule you cannot read is a
 * rule you cannot check. The binary is a build artifact and is not committed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FiltersEngine } from '@ghostery/adblocker';

const FILTERS = path.join(process.cwd(), 'electron', 'main', 'security', 'filters');
const OUT = path.join(process.cwd(), 'dist', 'electron', 'filters');

const manifestPath = path.join(FILTERS, 'manifest.json');
if (!existsSync(manifestPath)) {
  // Not a failure: a checkout without the lists still builds, and the browser
  // falls back to the curated hostnames it has always had. Saying so is the
  // point — a blocker that silently blocks nothing is the worst outcome.
  console.log('No filter manifest; skipping. The app will fall back to its curated hosts.');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const texts = manifest.lists.map((list) => {
  const file = path.join(FILTERS, `${list.name}.txt`);
  const text = readFileSync(file, 'utf8');
  const sha256 = createHash('sha256').update(text).digest('hex');
  // The manifest records what was fetched. A file that no longer matches it has
  // been edited by hand or damaged, and either way is not what was reviewed.
  if (sha256 !== list.sha256) {
    throw new Error(`${list.name}.txt does not match the manifest — run npm run filters:update`);
  }
  return text;
});

const started = Date.now();
const engine = FiltersEngine.parse(texts.join('\n'));
const bytes = engine.serialize();

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'engine.bin'), bytes);
writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const rules = manifest.lists.reduce((total, list) => total + list.rules, 0);
console.log(
  `Built ${rules.toLocaleString()} rules into ${(bytes.length / 1048576).toFixed(1)} MB in ${Date.now() - started}ms.`,
);
