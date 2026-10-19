import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Written at launch and removed on a quit, so one still there means the last run never quit.
const MARKER_NAME = 'running';

/** Leaves the mark that this run is going, and says whether the last one ended without quitting. */
export function markRunning(directory: string): boolean {
  const markerPath = path.join(directory, MARKER_NAME);
  const didLastRunEndBadly = existsSync(markerPath);
  writeFileSync(markerPath, String(process.pid));
  return didLastRunEndBadly;
}

export function markQuit(directory: string): void {
  rmSync(path.join(directory, MARKER_NAME), { force: true });
}
