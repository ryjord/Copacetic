import { describe, expect, it, vi } from 'vitest';

import type { Notice } from '../../../../electron/shared/chrome/notices';
import { TabCommands } from '../../../../electron/main/workflows/tab-commands';

type TabCommandsDeps = ConstructorParameters<typeof TabCommands>[0];

function commandsWith(
  printFails: string | null,
  zoomFactor = 1,
  page = { url: 'https://example.com/a', isHush: false },
) {
  const notices: Notice[] = [];
  const setZoom = vi.fn();
  const create = vi.fn();
  const deps = {
    store: { getSettings: () => ({ defaultZoomFactor: 1.25 }) },
    tabs: {
      getActiveTabId: () => 'tab-1',
      snapshot: () => ({ tabs: [{ id: 'tab-1', zoomFactor }], activeTabId: 'tab-1' }),
      setZoom,
      create,
      urlFor: () => page.url,
      isHush: () => page.isHush,
      savePage: async () => printFails ?? '',
      saveScreenshot: async () => printFails ?? '',
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
  return { commands: new TabCommands(deps), notices, setZoom, create };
}

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

describe("viewing a page's source", () => {
  it('opens it in a tab of its own', () => {
    const { commands, create } = commandsWith(null);
    commands.viewSourceOfActiveTab();
    expect(create).toHaveBeenCalledWith('view-source:https://example.com/a', { hush: false });
  });

  // Otherwise a Hush page's address would land in the shared session and in history.
  it("keeps a Hush page's source in Hush", () => {
    const { commands, create } = commandsWith(null, 1, { url: 'https://example.com/private', isHush: true });
    commands.viewSourceOfActiveTab();
    expect(create).toHaveBeenCalledWith('view-source:https://example.com/private', { hush: true });
  });

  it('offers nothing for a page that is not on the web', () => {
    const { commands, create } = commandsWith(null, 1, { url: 'copacetic://start', isHush: false });
    commands.viewSourceOfActiveTab();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('a command that fails', () => {
  it.each([
    {
      name: 'a page that does not print',
      reason: 'Printer is offline',
      run: (commands: TabCommands) => commands.printActiveTab(),
      key: 'print-failed',
      message: 'The page did not print: Printer is offline',
    },
    {
      name: 'a page that was not saved',
      reason: 'Disk full',
      run: (commands: TabCommands) => commands.saveActiveTab(),
      key: 'save-failed',
      message: 'The page was not saved: Disk full',
    },
    {
      name: 'a picture that was not saved',
      reason: 'Close the developer tools first',
      run: (commands: TabCommands) => commands.saveScreenshotOfActiveTab(),
      key: 'screenshot-failed',
      message: 'No picture of the page was saved: Close the developer tools first',
    },
  ])('says so for $name', async ({ reason, run, key, message }) => {
    const { commands, notices } = commandsWith(reason);
    run(commands);
    await vi.waitFor(() => expect(notices).toEqual([expect.objectContaining({ key, message })]));
  });
});
