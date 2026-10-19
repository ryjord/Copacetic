import { describe, expect, it } from 'vitest';
import { isRunnableFile } from '../../../electron/shared/download-safety';

describe('whether a downloaded file runs something when opened', () => {
  it.each(['setup.exe', 'Installer.DMG', 'update.pkg', 'run-me.sh', 'macro.vbs', 'app.apk', 'tool.jar'])(
    '%s does',
    (filename) => expect(isRunnableFile(filename)).toBe(true),
  );

  it.each(['report.pdf', 'photo.jpg', 'archive.zip', 'notes.txt', 'exe', 'readme'])('%s does not', (filename) =>
    expect(isRunnableFile(filename)).toBe(false),
  );

  // The system opens a file by its last extension, which is the one a disguise hides behind.
  it('judges a disguised file by the extension that counts', () => {
    expect(isRunnableFile('invoice.pdf.exe')).toBe(true);
    expect(isRunnableFile('setup.exe.txt')).toBe(false);
  });
});
