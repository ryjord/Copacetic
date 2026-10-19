/**
 * File types that run code when opened: programs, installers and scripts.
 *
 * Not a judgement of any particular file. A browser cannot know whether a
 * program is safe; it can make sure nobody runs one they did not mean to
 * download, which is how most drive-by downloads work.
 */
const RUNNABLE_EXTENSIONS = new Set([
  // Windows programs, installers and scripts.
  'exe',
  'msi',
  'msix',
  'appx',
  'bat',
  'cmd',
  'com',
  'scr',
  'pif',
  'cpl',
  'msc',
  'hta',
  'lnk',
  'reg',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'msp',
  'gadget',
  'scf',
  'url',
  'xll',
  'application',
  'appref-ms',
  // Disk images open as a drive whose contents can run.
  'iso',
  'img',
  'vhd',
  'vhdx',
  // macOS installers, disk images and scripts.
  'dmg',
  'pkg',
  'mpkg',
  'app',
  'command',
  'workflow',
  // Linux packages and scripts, and Java.
  'sh',
  'bash',
  'zsh',
  'run',
  'bin',
  'deb',
  'rpm',
  'appimage',
  'desktop',
  'py',
  'pyw',
  'pl',
  'rb',
  'jar',
  // Android.
  'apk',
]);

/** Whether opening this file would run something, judged by its last extension, which is what the system opens it by. */
export function isRunnableFile(filename: string): boolean {
  const extension = filename.toLowerCase().split('.').at(-1);
  return filename.includes('.') && extension !== undefined && RUNNABLE_EXTENSIONS.has(extension);
}
