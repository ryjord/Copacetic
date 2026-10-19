#!/usr/bin/env node
/**
 * Copies Bergamot's translation worker into the build, beside the main process.
 *
 * The worker is CommonJS inside a package that declares itself an ES module, so
 * Node refuses to run it where npm puts it. Copied into a folder that says it is
 * CommonJS, it runs unchanged: none of Bergamot's own files are edited, which is
 * also what its MPL-2.0 licence asks of a redistributor who has not changed them.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
console.log(`Copied the translation engine into ${path.relative(process.cwd(), OUT)}.`);
