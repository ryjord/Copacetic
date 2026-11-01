import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, shell: {} }));

const { desktopEntryFor, fileNameFor, macLauncherFor, shortcutPathFor } =
  await import('../../../../electron/main/system/app-shortcuts');

const MAIL = { id: 'Ab-9_x', name: 'Mail: "Inbox" / Work', url: 'https://mail.example.com/', createdAt: 1 };
const FOLDERS = { home: '/Users/riley', appData: 'C:\\Users\\riley\\AppData\\Roaming' };

describe('where an app shortcut goes', () => {
  it('is Copacetic Apps in Applications on macOS, the Start menu on Windows, and the user applications on Linux', () => {
    expect(shortcutPathFor('darwin', MAIL, FOLDERS)).toBe(
      '/Users/riley/Applications/Copacetic Apps/Mail Inbox Work.app',
    );
    expect(shortcutPathFor('win32', MAIL, FOLDERS)).toContain('Start Menu');
    expect(shortcutPathFor('linux', MAIL, FOLDERS)).toBe(
      '/Users/riley/.local/share/applications/copacetic-app-Ab-9_x.desktop',
    );
  });

  // A page's title becomes a file name, so nothing in it can name another folder.
  it('makes a file name of any title, separators and all', () => {
    expect(fileNameFor('../../etc/passwd')).toBe('etc passwd');
    expect(fileNameFor('\u0000\n')).toBe('Copacetic app');
  });
});

describe('what an app shortcut says', () => {
  it('opens Copacetic with --app on Linux, with the path quoted as the specification asks', () => {
    const entry = desktopEntryFor(
      { ...MAIL, name: 'Mail\nExec=evil' },
      '/home/riley/My "Apps"/Copacetic.AppImage',
      null,
    );
    expect(entry).toContain('Exec="/home/riley/My \\"Apps\\"/Copacetic.AppImage" --app=Ab-9_x');
    expect(entry).toContain('Name=Mail Exec=evil');
    expect(entry.split('\n').filter((line) => line.startsWith('Exec='))).toHaveLength(1);
  });

  it("is a launcher on macOS that opens the app's link, with its name escaped", () => {
    const { plist, script } = macLauncherFor({ ...MAIL, name: 'Mail & <Work>' }, true);
    expect(plist).toContain('<string>Mail &amp; &lt;Work&gt;</string>');
    expect(plist).toContain('<string>uk.mrenigma.copacetic.app.Ab-9-x</string>');
    expect(plist).toContain('CFBundleIconFile');
    expect(script).toBe("#!/bin/sh\nexec /usr/bin/open 'copacetic-app://open/Ab-9_x'\n");
  });
});
