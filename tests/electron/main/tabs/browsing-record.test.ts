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

const CERTIFICATE = { fingerprint: 'ab', issuer: 'Example CA', seenAt: 1 } as never;
const CLOSED = { url: 'https://example.com/', title: 'Example', index: 0, groupId: null, isPinned: false };

describe("an ordinary tab's record", () => {
  it('keeps each thing in the place it belongs', () => {
    const { store, closedTabs, record } = spies();
    record.recordVisit('https://example.com/', 'Example');
    record.addBlocked('https://example.com/', 3);
    record.keepFavicon('https://example.com/', 'data:image/png;base64,AAAA');
    record.rememberCertificate('https://example.com', CERTIFICATE);
    record.setZoomForOrigin('https://example.com', 1.5);
    record.rememberClosedTab(CLOSED);

    expect(store.recordVisit).toHaveBeenCalledWith('https://example.com/', 'Example');
    expect(store.addBlocked).toHaveBeenCalledWith('https://example.com/', 3);
    expect(store.setFavicon).toHaveBeenCalledWith('https://example.com/', 'data:image/png;base64,AAAA');
    expect(store.rememberCertificate).toHaveBeenCalledWith('https://example.com', CERTIFICATE);
    expect(store.setZoomForOrigin).toHaveBeenCalledWith('https://example.com', 1.5);
    expect(closedTabs.remember).toHaveBeenCalledWith(CLOSED);
  });
});

describe("a Hush tab's record", () => {
  // Every write an ordinary record makes has a Hush counterpart, so a write added to one cannot be missing from the other.
  it('answers every write an ordinary record makes', () => {
    expect(Object.keys(HUSH_RECORD).sort()).toEqual(Object.keys(spies().record).sort());
  });

  it('keeps nothing, and fails at nothing', () => {
    expect(() => {
      HUSH_RECORD.recordVisit('https://example.com/', 'Example');
      HUSH_RECORD.addBlocked('https://example.com/', 3);
      HUSH_RECORD.keepFavicon('https://example.com/', 'data:image/png;base64,AAAA');
      HUSH_RECORD.rememberCertificate('https://example.com', CERTIFICATE);
      HUSH_RECORD.setZoomForOrigin('https://example.com', 1.5);
      HUSH_RECORD.rememberClosedTab(CLOSED);
    }).not.toThrow();
  });
});
