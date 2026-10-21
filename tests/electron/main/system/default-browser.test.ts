import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, shell: {} }));

const { statusFor, urlFromArguments } = await import('../../../../electron/main/system/default-browser');

/**
 * Three platforms, three different answers, and a button that must say what
 * each one will actually do rather than what the others do.
 */
describe('what can be offered on each platform', () => {
  // Windows 10 and 11 will not let an application make itself the default, and an unpackaged build would register the development binary.
  it.each([
    ['says so when it is already the default on macOS', 'darwin', true, true, 'default'],
    ['says so when it is already the default on Windows', 'win32', true, true, 'default'],
    ['can ask on macOS, where the system will decide', 'darwin', true, false, 'can-ask'],
    ['can ask on Linux, where the system will decide', 'linux', true, false, 'can-ask'],
    ['can only point at the settings on Windows', 'win32', true, false, 'settings-only'],
    ['offers nothing from an unpackaged build on macOS', 'darwin', false, false, 'unavailable'],
    ['offers nothing from an unpackaged build on Windows', 'win32', false, false, 'unavailable'],
  ] as const)('%s', (_name, platform, isPackaged, isDefault, expected) => {
    expect(statusFor(platform, isPackaged, isDefault)).toBe(expected);
  });
});

/**
 * These arrive from outside the app entirely - another program's command line,
 * or a system event - so they are checked exactly like a link on a page.
 */
describe('the address another application asks Copacetic to open', () => {
  it.each([
    [
      'takes a web address from the arguments',
      ['/path/to/Copacetic', 'https://example.com/page'],
      'https://example.com/page',
    ],
    ['takes a local address from the arguments', ['copacetic', 'http://localhost:3000/'], 'http://localhost:3000/'],
    ['ignores the program being run, even where it looks like an address', ['https://example.com/'], null],
    ['ignores switches', ['copacetic', '--inspect', '--user-data-dir=/tmp/x'], null],
    [
      'takes the first address when several are given',
      ['copacetic', 'https://first.example/', 'https://second.example/'],
      'https://first.example/',
    ],
    [
      'finds an address that comes after a switch',
      ['copacetic', '--flag', 'https://example.com/'],
      'https://example.com/',
    ],
  ])('%s', (_name, argumentList, expected) => {
    expect(urlFromArguments(argumentList)).toBe(expected);
  });

  // Nothing else stops an argument becoming a tab, and these are the schemes a
  // page is never allowed to reach either.
  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://example.com/x',
    'not a url at all',
    '',
  ])('refuses %s', (argument) => {
    expect(urlFromArguments(['copacetic', argument])).toBeNull();
  });
});
