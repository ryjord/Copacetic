/**
 * Opens the built app on a fresh profile at Google's sign-in page, for a person
 * to sign in by hand, and records where each request went and what came back.
 *
 * Signing in has to be done by a person and in an ordinary launch: under
 * Playwright a page reports navigator.webdriver, and Google refuses a browser
 * that says it is automated. So this starts the app as someone would and only
 * reads the record once they quit it.
 *
 * The record keeps addresses without their query, the request type and the
 * status, and nothing that was typed, sent or received. It and the profile are
 * removed afterwards unless KEEP=1.
 *
 * Run it with `npm run record-sign-in` after `npm run build`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const START_AT = process.argv[2] ?? 'https://accounts.google.com/';
const electronBinary = createRequire(import.meta.url)('electron');
const workspace = mkdtempSync(path.join(tmpdir(), 'copacetic-sign-in-'));
const profile = path.join(workspace, 'profile');
const record = path.join(workspace, 'requests.tsv');

const environment = { ...process.env, NODE_ENV: 'production', COPACETIC_REQUEST_LOG: record };
delete environment.ELECTRON_RUN_AS_NODE;

console.log(`Sign in, then quit Copacetic. Recording to ${record}`);
const app = spawn(electronBinary, ['.', `--user-data-dir=${profile}`, START_AT], {
  env: environment,
  stdio: 'ignore',
});

app.on('exit', () => {
  const lines = existsSync(record) ? readFileSync(record, 'utf8').trim().split('\n').filter(Boolean) : [];
  const failures = lines.filter((line) => {
    const result = line.split('\t')[4] ?? '';
    return !/^[123]\d\d$/.test(result);
  });
  console.log(`\n${lines.length} requests recorded, ${failures.length} failed or refused:\n`);
  console.log(failures.join('\n') || 'none');
  const documents = lines.filter((line) => line.split('\t')[2] === 'mainFrame');
  console.log(`\nPages, in order:\n${documents.map((line) => line.split('\t').slice(4).join('  ')).join('\n')}`);
  if (process.env.KEEP === '1') {
    console.log(`\nKept: ${workspace}`);
    return;
  }
  rmSync(workspace, { recursive: true, force: true, maxRetries: 5 });
});
