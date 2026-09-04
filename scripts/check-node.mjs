/**
 * Says which Node this project needs, before anything else fails in its own way.
 *
 * The README states the floor correctly and nobody reads a README because of a
 * stack trace. On Node 20 the suite does not fail — it does not start, and
 * prints seventy-three copies of `TypeError: webidl.util.markAsUncloneable is
 * not a function`, which comes from jsdom's undici and names nothing anyone can
 * act on. On a supported Node the same command runs every test in a few seconds.
 *
 * So the version is checked first and the answer is one sentence.
 *
 * The audit suggested `engine-strict` in .npmrc instead. Tried, and it is the
 * wrong tool: it applies to every dependency's engines rather than this
 * project's, and jsdom asks for ^24.15.0 — so it refuses to install on Node
 * 24.14, where the entire suite passes. A check of this project's own floor
 * breaks nobody and says the same thing.
 */
import { readFileSync } from 'node:fs';

const { engines } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const required = engines?.node ?? '';

const wanted = required
  .replace(/^[^\d]*/, '')
  .split('.')
  .map(Number);
const running = process.versions.node.split('.').map(Number);

const tooOld = (() => {
  for (let index = 0; index < wanted.length; index += 1) {
    const need = wanted[index] ?? 0;
    const have = running[index] ?? 0;
    if (have !== need) {
      return have < need;
    }
  }
  return false;
})();

if (tooOld) {
  console.error(
    [
      '',
      `Copacetic needs Node ${required}. This is Node ${process.versions.node}.`,
      '',
      'Below that floor the test suite does not fail — it does not start, and says so',
      'seventy-three times in a message about jsdom that names nothing you can act on.',
      '',
      '  nvm use 22    (or any newer)',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
