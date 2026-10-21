import { describe, expect, it } from 'vitest';
import { launchRestore } from '../../../../electron/main/app/launch-restore';

describe('what a launch does with the tabs from last time', () => {
  // Turning reopening off is choosing to start fresh after a quit, not choosing to lose tabs to a crash.
  it.each([
    ['reopens them when reopening is on', true, true, false, 'reopen'],
    ['reopens them after a crash when reopening is on, without asking', true, true, true, 'reopen'],
    ['offers them back after a crash when reopening is off', false, true, true, 'offer'],
    ['starts fresh after an ordinary quit when reopening is off', false, true, false, 'fresh'],
    ['starts fresh when nothing was saved, with reopening on', true, false, true, 'fresh'],
    ['starts fresh when nothing was saved, with reopening off', false, false, true, 'fresh'],
  ])('%s', (_name, isReopenOn, hasSavedWindows, didLastRunEndBadly, expected) => {
    expect(launchRestore({ isReopenOn, hasSavedWindows, didLastRunEndBadly })).toBe(expected);
  });
});
