// Libs
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

// Utils
import { app } from '../engine/app';
import { isStoreBuild } from '../engine/system';
import { describeError, log } from './diagnostics';

const run = promisify(execFile);

/** Whether `codesign -dv` describes an app signed by an identified developer, rather than ad hoc or not at all. */
export function isDeveloperSigned(codesignOutput: string): boolean {
  return /^Authority=Developer ID Application: /m.test(codesignOutput) && !/^Signature=adhoc$/m.test(codesignOutput);
}

let signed: Promise<boolean> | null = null;

/**
 * Whether this copy is signed by its developer, read from the copy itself
 * rather than from the build: a Store package is signed by Microsoft, and a
 * Mac app is asked of `codesign`. Everything else is not, and says so.
 */
export function isThisCopySigned(): Promise<boolean> {
  signed ??= readSignature();
  return signed;
}

async function readSignature(): Promise<boolean> {
  if (isStoreBuild()) {
    return true;
  }
  if (process.platform !== 'darwin' || !app.isPackaged) {
    return false;
  }
  // From Contents/MacOS/Copacetic up to Copacetic.app.
  const bundle = path.resolve(process.execPath, '..', '..', '..');
  try {
    // codesign writes what it found to stderr, and only that.
    const { stderr } = await run('/usr/bin/codesign', ['-dv', '--verbose=2', bundle]);
    return isDeveloperSigned(stderr);
  } catch (error) {
    log.warn('could not read this copy’s code signature', describeError(error));
    return false;
  }
}
