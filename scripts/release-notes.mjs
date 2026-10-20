// Prints one version's section of CHANGELOG.md, the release's notes on GitHub
// and what the app shows before updating. Usage: node scripts/release-notes.mjs 2.0.0-beta.3
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Give the version, without its v.');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const heading = new RegExp(`^## ${version.replaceAll('.', '\\.')}(?:\\s|$)`, 'm');
const start = changelog.search(heading);
if (start === -1) {
  // A release with no entry would go out with no notes and nobody would notice.
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
const afterHeading = changelog.indexOf('\n', start) + 1;
const next = changelog.slice(afterHeading).search(/^## /m);
const section = next === -1 ? changelog.slice(afterHeading) : changelog.slice(afterHeading, afterHeading + next);
process.stdout.write(`${section.trim()}\n`);
