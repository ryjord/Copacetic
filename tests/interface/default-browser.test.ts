import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, shell: {} }));

const { statusFor, urlFromArguments } = await import('../../electron/main/app/default-browser');

/**
 * Three platforms, three different answers, and a button that must say what
 * each one will actually do rather than what the others do.
 */
describe('what can be offered on each platform', () => {
  it('says so when it is already the default', () => {
    expect(statusFor('darwin', true, true)).toBe('default');
    expect(statusFor('win32', true, true)).toBe('default');
  });

  it('can ask on macOS and Linux, where the system will decide', () => {
    expect(statusFor('darwin', true, false)).toBe('can-ask');
    expect(statusFor('linux', true, false)).toBe('can-ask');
  });

  // Windows 10 and 11 will not let an application make itself the default.
  it('can only point at the settings on Windows', () => {
    expect(statusFor('win32', true, false)).toBe('settings-only');
  });

  // It would register the development binary as the system's browser.
  it('offers nothing from a build that is not packaged', () => {
    expect(statusFor('darwin', false, false)).toBe('unavailable');
    expect(statusFor('win32', false, false)).toBe('unavailable');
  });
});

/**
 * These arrive from outside the app entirely — another program's command line,
 * or a system event — so they are checked exactly like a link on a page.
 */
describe('the address another application asks Copacetic to open', () => {
  it('takes a web address from the arguments', () => {
    expect(urlFromArguments(['/path/to/Copacetic', 'https://example.com/page'])).toBe('https://example.com/page');
    expect(urlFromArguments(['copacetic', 'http://localhost:3000/'])).toBe('http://localhost:3000/');
  });

  it('ignores the program being run, even where it looks like an address', () => {
    expect(urlFromArguments(['https://example.com/'])).toBeNull();
  });

  it('ignores switches', () => {
    expect(urlFromArguments(['copacetic', '--inspect', '--user-data-dir=/tmp/x'])).toBeNull();
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

  it('takes the first address when several are given', () => {
    expect(urlFromArguments(['copacetic', 'https://first.example/', 'https://second.example/'])).toBe(
      'https://first.example/',
    );
  });

  it('finds an address that comes after a switch', () => {
    expect(urlFromArguments(['copacetic', '--flag', 'https://example.com/'])).toBe('https://example.com/');
  });
});
