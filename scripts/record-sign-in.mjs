/**
 * Opens the built app on a fresh profile at Google's sign-in page for a person
 * to sign in by hand, in an ordinary launch since Google refuses a browser that
 * reports navigator.webdriver, then prints the requests that failed and the
 * pages in order. Run `npm run record-sign-in` after `npm run build`; KEEP=1
 * keeps the record and profile.
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
  const text = existsSync(record) ? readFileSync(record, 'utf8') : '';
  // Columns as request-log.ts writes them: when, partition, type, method, result, address.
  const requests = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [, , resourceType = '', , result = '', address = ''] = line.split('\t');
      return { line, resourceType, result, address };
    });
  const failures = requests.filter((request) => !/^[123]\d\d$/.test(request.result));
  console.log(`\n${requests.length} requests recorded, ${failures.length} failed or refused:\n`);
  console.log(failures.map((request) => request.line).join('\n') || 'none');
  const pages = requests.filter((request) => request.resourceType === 'mainFrame');
  console.log(`\nPages, in order:\n${pages.map((request) => `${request.result}  ${request.address}`).join('\n')}`);
  if (process.env.KEEP === '1') {
    console.log(`\nKept: ${workspace}`);
    return;
  }
  rmSync(workspace, { recursive: true, force: true, maxRetries: 5 });
});
