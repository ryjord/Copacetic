import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { markQuit, markRunning } from '../../../../electron/main/system/exit-marker';

let directory = '';

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'copacetic-exit-marker-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('telling whether the last run ended without quitting', () => {
  it('says not, on the very first launch', () => {
    expect(markRunning(directory)).toBe(false);
  });

  it('says not, after a quit', () => {
    markRunning(directory);
    markQuit(directory);
    expect(markRunning(directory)).toBe(false);
  });

  it('says so, when the last run never quit', () => {
    markRunning(directory);
    expect(markRunning(directory)).toBe(true);
  });

  it('quits cleanly even when nothing was marked', () => {
    expect(() => markQuit(directory)).not.toThrow();
  });
});
