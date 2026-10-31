#!/usr/bin/env node
/**
 * Copies Bergamot's translation worker into the build, beside the main process.
 *
 * The worker is CommonJS inside a package that declares itself an ES module, so
 * Node refuses to run it where npm puts it; copied into a folder that says it is
 * CommonJS, it runs. The worker is changed in four places, listed in CHANGES;
 * MPL-2.0 asks that changed files say so, so the worker gets the licence's
 * notice, and MPL-CHANGES.txt and the licence text are written beside it.
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
  {
    why: 'Builds the file path with Node, since url.pathname turns D:\\a into D:\\D:\\a on Windows.',
    original: 'const buffer = await readFile(url.pathname);',
    replacement: "const buffer = await readFile(require('node:url').fileURLToPath(url));",
  },
  {
    why: 'Builds the file address with Node, for the same reason.',
    original: 'return new URL(`file://${__filename}`);',
    replacement: "return require('node:url').pathToFileURL(__filename);",
  },
  {
    why: 'Talks through Electron process.parentPort, since a utility process has no worker_threads parent.',
    original:
      "const {parentPort} = require(/* webpackIgnore: true */ 'node:worker_threads');\n            this.#port = parentPort;",
    replacement:
      'this.#port = { on: (eventName, listener) => process.parentPort.on(eventName, (event) => listener(event.data)), postMessage: (message) => process.parentPort.postMessage(message) };',
  },
  {
    why: 'Supplies WebAssembly.instantiateStreaming, which a utility process lacks, from WebAssembly.instantiate.',
    original: 'var Module = {};',
    replacement:
      "var Module = {};\nif (typeof WebAssembly.instantiateStreaming !== 'function') {\n    WebAssembly.instantiateStreaming = async (source, imports) =>\n        WebAssembly.instantiate(await (await source).arrayBuffer(), imports);\n}",
  },
];
const { version } = require('@browsermt/bergamot-translator/package.json');
// MPL-2.0 Exhibit A, which the file does not carry upstream, and where the changes are listed.
const MPL_HEADER = `/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Changed by Copacetic at build time from worker/translator-worker.js in
 * @browsermt/bergamot-translator ${version} (https://github.com/browsermt/bergamot-translator).
 * Every change is listed in MPL-CHANGES.txt beside this file.
 */
`;
const workerPath = path.join(OUT, 'translator-worker.js');
let worker = readFileSync(workerPath, 'utf8');
for (const { original, replacement } of CHANGES) {
  if (!worker.includes(original)) {
    console.error(`Bergamot's worker no longer contains: ${original}`);
    process.exit(1);
  }
  worker = worker.replace(original, replacement);
}
writeFileSync(workerPath, MPL_HEADER + worker);
const changeList = CHANGES.map(
  ({ why, original, replacement }, index) =>
    `${index + 1}. ${why}\n\n   Was:\n${original.replace(/^/gm, '     ')}\n\n   Now:\n${replacement.replace(/^/gm, '     ')}\n`,
).join('\n');
writeFileSync(
  path.join(OUT, 'MPL-CHANGES.txt'),
  `translator-worker.js is Covered Software under the Mozilla Public License 2.0 (LICENSE-MPL-2.0.txt).\nIt is @browsermt/bergamot-translator ${version}'s worker/translator-worker.js with these changes, made at build time;\nthe other files here are unchanged. Source: https://github.com/browsermt/bergamot-translator\n\n${changeList}`,
);
copyFileSync(path.join(process.cwd(), 'licences', 'MPL-2.0.txt'), path.join(OUT, 'LICENSE-MPL-2.0.txt'));
writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
console.log(`Copied the translation engine into ${path.relative(process.cwd(), OUT)}.`);
