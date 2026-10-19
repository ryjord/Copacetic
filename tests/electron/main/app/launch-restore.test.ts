import { describe, expect, it } from 'vitest';
import { launchRestore } from '../../../../electron/main/app/launch-restore';

describe('what a launch does with the tabs from last time', () => {
  it('reopens them when reopening is on', () => {
    expect(launchRestore({ isReopenOn: true, hasSavedWindows: true, didLastRunEndBadly: false })).toBe('reopen');
  });

  it('reopens them after a crash when reopening is on, without asking', () => {
    expect(launchRestore({ isReopenOn: true, hasSavedWindows: true, didLastRunEndBadly: true })).toBe('reopen');
  });

  // Turning reopening off is choosing to start fresh after a quit, not choosing to lose tabs to a crash.
  it('offers them back after a crash when reopening is off', () => {
    expect(launchRestore({ isReopenOn: false, hasSavedWindows: true, didLastRunEndBadly: true })).toBe('offer');
  });

  it('starts fresh after an ordinary quit when reopening is off', () => {
    expect(launchRestore({ isReopenOn: false, hasSavedWindows: true, didLastRunEndBadly: false })).toBe('fresh');
  });

  it.each([true, false])('starts fresh when nothing was saved (reopening on: %s)', (isReopenOn) => {
    expect(launchRestore({ isReopenOn, hasSavedWindows: false, didLastRunEndBadly: true })).toBe('fresh');
  });
});
