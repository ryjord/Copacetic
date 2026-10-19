import { describe, expect, it, vi } from 'vitest';

import type { Notice } from '../../../../electron/shared/notices';
import { TabCommands } from '../../../../electron/main/workflows/tab-commands';

type TabCommandsDeps = ConstructorParameters<typeof TabCommands>[0];

function commandsWith(printFails: string | null, zoomFactor = 1) {
  const notices: Notice[] = [];
  const setZoom = vi.fn();
  const deps = {
    store: { getSettings: () => ({ defaultZoomFactor: 1.25 }) },
    tabs: {
      getActiveTabId: () => 'tab-1',
      snapshot: () => ({ tabs: [{ id: 'tab-1', zoomFactor }], activeTabId: 'tab-1' }),
      setZoom,
      print: (_id: string, onFailed: (reason: string) => void) => {
        if (printFails) {
          onFailed(printFails);
        }
      },
    },
    notices: { notify: (notice: Notice) => notices.push(notice) },
    changed: () => {},
    push: () => {},
    // Only the parts these commands reach are faked.
  } as unknown as TabCommandsDeps;
  return { commands: new TabCommands(deps), notices, setZoom };
}

describe('printing', () => {
  it('says so when a page does not print', () => {
    const { commands, notices } = commandsWith('Printer is offline');
    commands.printActiveTab();
    expect(notices).toEqual([
      expect.objectContaining({ key: 'print-failed', message: 'The page did not print: Printer is offline' }),
    ]);
  });

  it('stays quiet when it prints', () => {
    const { commands, notices } = commandsWith(null);
    commands.printActiveTab();
    expect(notices).toEqual([]);
  });
});

describe('zooming', () => {
  it('steps along the same ladder as the palette', () => {
    const { commands, setZoom } = commandsWith(null, 1.2);
    commands.adjustZoom('in');
    expect(setZoom).toHaveBeenCalledWith('tab-1', 1.25);
  });

  it('resets to the default zoom, not to 100%', () => {
    const { commands, setZoom } = commandsWith(null, 2);
    commands.adjustZoom('reset');
    expect(setZoom).toHaveBeenCalledWith('tab-1', 1.25);
  });
});
