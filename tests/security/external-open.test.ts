import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0' },
  dialog: {},
  session: { fromPartition: () => ({}) },
  shell: {},
}));

const { mayBeHandedToOs } = await import('../../electron/main/app/browser');

/**
 * A link Copacetic refuses to navigate to reaches this path next. Handing it to
 * the OS instead would route around the refusal rather than enforce it: the
 * user is asked a question, and answering "Open" would run the thing the
 * security model just rejected.
 */
describe('what may be handed to another application', () => {
  it.each([
    ['script in a link', 'javascript:alert(1)'],
    ['an inline document', 'data:text/html,<script>alert(1)</script>'],
    ['an in-page blob', 'blob:https://example.com/8f2a'],
    ['the legacy scripting scheme', 'vbscript:msgbox(1)'],
    ['sandboxed storage', 'filesystem:https://example.com/temporary/x'],
    ['a path on this machine', 'file:///etc/passwd'],
    ['an internal page', 'about:blank'],
  ])('refuses %s outright, without asking', (_name, url) => {
    expect(mayBeHandedToOs(url)).toBe(false);
  });

  // The refusal is on the scheme, so casing and padding cannot get round it.
  it.each(['JavaScript:alert(1)', 'JAVASCRIPT:alert(1)', 'DATA:text/html,x', 'File:///etc/passwd'])(
    'refuses %s however it is spelled',
    (url) => {
      expect(mayBeHandedToOs(url)).toBe(false);
    },
  );

  it.each(['', 'not a url', '///', 'javascript'])('refuses %o rather than guessing', (url) => {
    expect(mayBeHandedToOs(url)).toBe(false);
  });

  // These are the point of the feature: a real application registered for a
  // scheme Copacetic does not handle. They still get a confirmation dialog.
  it.each([
    ['mail', 'mailto:someone@example.com'],
    ['a call', 'tel:+441234567890'],
    ['a meeting', 'zoommtg://zoom.us/join?confno=1'],
    ['an editor', 'vscode://file/Users/x/project'],
    ['a torrent', 'magnet:?xt=urn:btih:abcdef'],
  ])('lets %s through to the confirmation', (_name, url) => {
    expect(mayBeHandedToOs(url)).toBe(true);
  });
});
