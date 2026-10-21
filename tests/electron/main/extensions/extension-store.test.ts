import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { ExtensionStore } = await import('../../../../electron/main/extensions/extension-store');

const ID = 'a'.repeat(32);

function profileWith(entries: unknown[]) {
  const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-extension-store-'));
  const folder = path.join(directory, 'Extensions', ID, '1.0');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(directory, 'extensions.json'),
    JSON.stringify(entries.map((entry) => ({ id: ID, source: 'store', folder, installedAt: 1, ...Object(entry) }))),
  );
  return directory;
}

describe('the extensions a profile keeps', () => {
  // Every extension was on the toolbar before it could be unpinned, so one kept before then stays there.
  it('pins one kept before pinning existed', () => {
    const store = new ExtensionStore(profileWith([{ isEnabled: true }]));
    expect(store.find(ID)?.isPinned).toBe(true);
  });

  it('keeps an extension unpinned, and off, across a restart', () => {
    const directory = profileWith([{ isEnabled: true, isPinned: true }]);
    const store = new ExtensionStore(directory);
    store.change(ID, { isPinned: false });
    store.change(ID, { isEnabled: false });
    store.flush();
    const restarted = new ExtensionStore(directory).find(ID);
    expect(restarted).toMatchObject({ isPinned: false, isEnabled: false });
  });
});
