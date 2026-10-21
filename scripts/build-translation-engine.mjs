#!/usr/bin/env node
/**
 * Copies Bergamot's translation worker into the build, beside the main process.
 *
 * The worker is CommonJS inside a package that declares itself an ES module, so
 * Node refuses to run it where npm puts it; copied into a folder that says it is
 * CommonJS, it runs. Two changes are made, and stated in NOTICE as MPL-2.0 asks:
 * the worker builds file addresses by hand, which turns `D:\a` into `D:\D:\a` on
 * Windows, so those two lines use Node's own conversions instead; and it talks
 * through Electron's process.parentPort, since it runs in a utility process of
 * its own rather than a worker thread, supplying WebAssembly.instantiateStreaming
 * where that process lacks it.
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
// Each must still be found; a newer Bergamot that changed them should fail here, not on a person's machine later.
const CHANGES = [
  [
    'const buffer = await readFile(url.pathname);',
    "const buffer = await readFile(require('node:url').fileURLToPath(url));",
  ],
  ['return new URL(`file://${__filename}`);', "return require('node:url').pathToFileURL(__filename);"],
  // A utility process has no worker_threads parent; Electron hands it process.parentPort, whose messages carry data.
  [
    "const {parentPort} = require(/* webpackIgnore: true */ 'node:worker_threads');\n            this.#port = parentPort;",
    'this.#port = { on: (eventName, listener) => process.parentPort.on(eventName, (event) => listener(event.data)), postMessage: (message) => process.parentPort.postMessage(message) };',
  ], // Nor has it WebAssembly.instantiateStreaming, which is instantiate given the response's bytes.
  [
    'var Module = {};',
    "var Module = {};\nif (typeof WebAssembly.instantiateStreaming !== 'function') {\n    WebAssembly.instantiateStreaming = async (source, imports) =>\n        WebAssembly.instantiate(await (await source).arrayBuffer(), imports);\n}",
  ],
];
const workerPath = path.join(OUT, 'translator-worker.js');
let worker = readFileSync(workerPath, 'utf8');
for (const [original, replacement] of CHANGES) {
  if (!worker.includes(original)) {
    console.error(`Bergamot's worker no longer contains: ${original}`);
    process.exit(1);
  }
  worker = worker.replace(original, replacement);
}
writeFileSync(workerPath, worker);
writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
console.log(`Copied the translation engine into ${path.relative(process.cwd(), OUT)}.`);
