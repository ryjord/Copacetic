import { describe, expect, it, vi } from 'vitest';

const loginListeners: ((...args: unknown[]) => void)[] = [];
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
    on: (name: string, listener: (...args: unknown[]) => void) => name === 'login' && loginListeners.push(listener),
    removeListener: () => {},
  },
  dialog: {},
  session: { fromPartition: () => ({}) },
  shell: {},
}));

const { ExternalOpenGate, REFUSED_COOLDOWN_MS, mayBeHandedToOs, watchAuthChallenges } =
  await import('../../../../electron/main/security/browser-delegate');

/**
 * A link Copacetic refuses to navigate to reaches this path next. Handing it to
 * the OS instead would route around the refusal rather than enforce it: the
 * user is asked a question, and answering "Open" would run the thing the
 * security model just rejected.
 */
describe('what may be handed to another application', () => {
  // The refusal is on the scheme, so casing and padding cannot get round it, and anything unparseable is refused rather than guessed at.
  // The legacy Windows handlers have each been used to run code or fetch files from a page with one click.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://example.com/8f2a',
    'vbscript:msgbox(1)',
    'filesystem:https://example.com/temporary/x',
    'file:///etc/passwd',
    'about:blank',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'DATA:text/html,x',
    'File:///etc/passwd',
    '',
    'not a url',
    '///',
    'javascript',
    'ms-msdt:/id',
    'search-ms:query=x',
    'MS-OFFICECMD:x',
    'hcp://system',
    'shell:startup',
  ])('refuses %o outright, without asking', (url) => {
    expect(mayBeHandedToOs(url)).toBe(false);
  });

  // These are the point of the feature: a real application registered for a scheme Copacetic does not handle. They still get a confirmation dialog.
  it.each([
    'mailto:someone@example.com',
    'tel:+441234567890',
    'zoommtg://zoom.us/join?confno=1',
    'vscode://file/Users/x/project',
    'magnet:?xt=urn:btih:abcdef',
    'mailto:a@b.test',
    'zoommtg://join',
    'vscode://file/x',
    'slack://open',
  ])('lets %s through to the confirmation', (url) => {
    expect(mayBeHandedToOs(url)).toBe(true);
  });
});

describe('asking about one app link at a time', () => {
  it('asks nothing while a question is already open', async () => {
    const gate = new ExternalOpenGate();
    let answer: (value: boolean) => void = () => {};
    const first = gate.ask(1, () => new Promise((resolve) => (answer = resolve)));
    expect(await gate.ask(1, async () => true)).toBe(false);
    answer(true);
    expect(await first).toBe(true);
  });

  // A page that loops app links after a no would otherwise raise dialog after dialog.
  it('does not ask a tab again for a while after it was told no', async () => {
    let now = 0;
    const gate = new ExternalOpenGate(() => now);
    await gate.ask(1, async () => false);
    expect(await gate.ask(1, async () => true)).toBe(false);
    expect(await gate.ask(2, async () => true)).toBe(true);
    now = REFUSED_COOLDOWN_MS;
    expect(await gate.ask(1, async () => true)).toBe(true);
  });
});

// Each open profile listens on the app, and a proxy belongs to none of them, so each one asked.
describe('a proxy asking for a password', () => {
  it('is asked about once, however many profiles are open', () => {
    const added: string[] = [];
    const profile = () => ({
      window: () => undefined,
      store: {},
      prompts: { addAuth: (prompt: { id: string }) => added.push(prompt.id), forgetAuth: () => {} },
      tabs: () => ({ tabIdForWebContentsId: () => null, urlFor: () => null, create: () => {} }),
      onPromptsChanged: () => {},
    });
    watchAuthChallenges(profile() as never);
    watchAuthChallenges(profile() as never);

    const details = { url: 'http://proxy.example:3128/' };
    const authInfo = { isProxy: true, host: 'proxy.example', port: 3128, realm: 'office', scheme: 'basic' };
    loginListeners.forEach((listener) => listener({ preventDefault: () => {} }, null, details, authInfo, () => {}));
    expect(added).toHaveLength(1);
  });
});
