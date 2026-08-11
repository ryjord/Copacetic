import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_ZOOM_DIR } }));

const { BrowserStore } = await import('../electron/main/store');

let store: InstanceType<typeof BrowserStore>;

beforeEach(() => {
  process.env.COPA_ZOOM_DIR = mkdtempSync(path.join(tmpdir(), 'copacetic-zoom-'));
  store = new BrowserStore();
});

describe('per-site zoom', () => {
  it('remembers a level against its origin', () => {
    store.setZoomForOrigin('https://example.com', 1.5);
    expect(store.getZoomForOrigin('https://example.com')).toBe(1.5);
  });

  it('is null for a site never zoomed, so the default applies', () => {
    expect(store.getZoomForOrigin('https://never.example')).toBeNull();
  });

  // A permission or a zoom granted to one origin must never apply to another.
  it('keeps origins separate', () => {
    store.setZoomForOrigin('https://example.com', 1.5);
    expect(store.getZoomForOrigin('https://other.example')).toBeNull();
    expect(store.getZoomForOrigin('http://example.com')).toBeNull();
  });

  // The list in Settings should be the sites you changed, not everywhere you
  // have been, so returning to the default is a deletion rather than an entry.
  it('forgets a level put back to the default', () => {
    store.setZoomForOrigin('https://example.com', 1.5);
    store.setZoomForOrigin('https://example.com', 1);
    expect(store.getZoomForOrigin('https://example.com')).toBeNull();
    expect(store.getSettings().zoomLevels).toEqual({});
  });

  it('can be reset explicitly', () => {
    store.setZoomForOrigin('https://example.com', 2);
    store.forgetZoomForOrigin('https://example.com');
    expect(store.getZoomForOrigin('https://example.com')).toBeNull();
  });

  it('ignores an empty origin rather than storing one', () => {
    store.setZoomForOrigin('', 2);
    expect(store.getSettings().zoomLevels).toEqual({});
  });

  it('survives being written and read back', () => {
    store.setZoomForOrigin('https://example.com', 1.25);
    store.flushAll();

    const reopened = new BrowserStore();
    expect(reopened.getZoomForOrigin('https://example.com')).toBe(1.25);
  });

  // settings.json is a file the user can edit, so it is untrusted input.
  it('bounds a level loaded from disk', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      path.join(process.env.COPA_ZOOM_DIR!, 'settings.json'),
      JSON.stringify({ zoomLevels: { 'https://a.example': 500, 'https://b.example': -3, 'https://c.example': 'x' } }),
    );

    const reopened = new BrowserStore();
    expect(reopened.getZoomForOrigin('https://a.example')).toBe(5);
    expect(reopened.getZoomForOrigin('https://b.example')).toBe(0.25);
    // Not a number at all, so it is dropped rather than coerced.
    expect(reopened.getZoomForOrigin('https://c.example')).toBeNull();
  });
});

describe('interface density', () => {
  it('defaults to comfortable', () => {
    expect(store.getSettings().density).toBe('comfortable');
  });

  it('accepts only the two it knows', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(process.env.COPA_ZOOM_DIR!, 'settings.json'), JSON.stringify({ density: 'enormous' }));
    expect(new BrowserStore().getSettings().density).toBe('comfortable');
  });

  it('keeps a valid choice', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(process.env.COPA_ZOOM_DIR!, 'settings.json'), JSON.stringify({ density: 'compact' }));
    expect(new BrowserStore().getSettings().density).toBe('compact');
  });
});
