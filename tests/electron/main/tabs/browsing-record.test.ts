import { describe, expect, it, vi } from 'vitest';
import { HUSH_RECORD, storedRecord } from '../../../../electron/main/tabs/browsing-record';

const spies = () => {
  const store = {
    recordVisit: vi.fn(),
    addBlocked: vi.fn(),
    setFavicon: vi.fn(),
    rememberCertificate: vi.fn(),
    setZoomForOrigin: vi.fn(),
  };
  const closedTabs = { remember: vi.fn() };
  return { store, closedTabs, record: storedRecord(store as never, closedTabs as never) };
};

describe("a Hush tab's record", () => {
  // Every write an ordinary record makes has a Hush counterpart, so a write added to one cannot be missing from the other.
  it('answers every write an ordinary record makes', () => {
    expect(Object.keys(HUSH_RECORD).sort()).toEqual(Object.keys(spies().record).sort());
  });
});
