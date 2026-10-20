import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { iconDataUrl, readManifest } = await import('../../../../electron/main/extensions/manifest');

function folderWith(manifest: Record<string, unknown>, files: Record<string, string> = {}): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'copacetic-manifest-'));
  writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  Object.entries(files).forEach(([name, text]) => {
    mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    writeFileSync(path.join(folder, name), text);
  });
  return folder;
}

describe('an extension manifest', () => {
  it('reads its name from its own default locale', () => {
    const folder = folderWith(
      { manifest_version: 3, name: '__MSG_appName__', version: '1.2', default_locale: 'en' },
      { '_locales/en/messages.json': JSON.stringify({ appname: { message: 'Dark Reader' } }) },
    );
    expect(readManifest(folder).name).toBe('Dark Reader');
  });

  it('counts content scripts as sites it may read', () => {
    const folder = folderWith({
      manifest_version: 3,
      name: 'Notes',
      version: '1',
      host_permissions: ['https://a.example/*'],
      content_scripts: [{ matches: ['https://b.example/*'], js: ['x.js'] }],
    });
    expect(readManifest(folder).hostPermissions).toEqual(['https://a.example/*', 'https://b.example/*']);
  });

  it('finds the toolbar button and its largest icon', () => {
    const folder = folderWith({
      manifest_version: 3,
      name: 'Notes',
      version: '1',
      action: { default_popup: '/popup.html', default_icon: { '16': 'small.png', '128': 'large.png' } },
    });
    expect(readManifest(folder).action).toEqual({ title: 'Notes', popup: 'popup.html', icon: 'large.png' });
  });

  it('refuses Manifest V2, which the store no longer serves', () => {
    expect(() => readManifest(folderWith({ manifest_version: 2, name: 'Old', version: '1' }))).toThrow(/Manifest V3/);
  });

  it('never reads an icon from outside the extension', () => {
    const folder = folderWith({ manifest_version: 3, name: 'Notes', version: '1' }, { 'icon.png': 'png' });
    expect(iconDataUrl(folder, 'icon.png')).toMatch(/^data:image\/png;base64,/);
    expect(iconDataUrl(folder, '../../etc/passwd.png')).toBeNull();
  });
});
