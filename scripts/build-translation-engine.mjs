#!/usr/bin/env node
/**
 * Copies Bergamot's translation worker into the build, beside the main process.
 *
 * The worker is CommonJS inside a package that declares itself an ES module, so
 * Node refuses to run it where npm puts it; copied into a folder that says it is
 * CommonJS, it runs. One change is made, and stated in NOTICE as MPL-2.0 asks:
 * the worker builds file addresses by hand, which turns `D:\a` into `D:\D:\a` on
 * Windows, so those two lines use Node's own conversions instead.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageDirectory = path.dirname(require.resolve('@browsermt/bergamot-translator/package.json'));
const OUT = path.join(process.cwd(), 'dist', 'electron', 'translation', 'engine');
const FILES = ['translator-worker.js', 'bergamot-translator-worker.js', 'bergamot-translator-worker.wasm'];

mkdirSync(OUT, { recursive: true });
for (const file of FILES) {
  const source = path.join(packageDirectory, 'worker', file);
  if (!existsSync(source)) {
    console.error(`Bergamot's ${file} is missing; is @browsermt/bergamot-translator installed?`);
    process.exit(1);
  }
  copyFileSync(source, path.join(OUT, file));
}
// Each must still be found; a newer Bergamot that changed them should fail here, not on Windows later.
const WINDOWS_PATHS = [
  [
    'const buffer = await readFile(url.pathname);',
    "const buffer = await readFile(require('node:url').fileURLToPath(url));",
  ],
  ['return new URL(`file://${__filename}`);', "return require('node:url').pathToFileURL(__filename);"],
];
const workerPath = path.join(OUT, 'translator-worker.js');
let worker = readFileSync(workerPath, 'utf8');
for (const [original, replacement] of WINDOWS_PATHS) {
  if (!worker.includes(original)) {
    console.error(`Bergamot's worker no longer contains: ${original}`);
    process.exit(1);
  }
  worker = worker.replace(original, replacement);
}
writeFileSync(workerPath, worker);
writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
console.log(`Copied the translation engine into ${path.relative(process.cwd(), OUT)}.`);
