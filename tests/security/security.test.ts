import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionDecision, PermissionKind } from '../../electron/shared/types';

// The module reaches electron for the session partition and `shell`; the
// behaviour under test is all in the handlers it installs.
vi.mock('electron', () => ({
  app: { isPackaged: true, getAppPath: () => '/app' },
  session: { fromPartition: () => ({}) },
  shell: { openExternal: vi.fn() },
}));

const {
  guardChromeWebContents,
  guardTabWebContents,
  hardenWebSession,
  isTransportSecure,
  stripElectronFromUserAgent,
} = await import('../../electron/main/security/security');

type Handler = (...args: never[]) => unknown;

/** The slice of Session the hardening actually touches. */
function fakeSession() {
  const captured: Record<string, Handler> = {};
  return {
    captured,
    session: {
      setPermissionRequestHandler: (fn: Handler) => (captured.request = fn),
      setPermissionCheckHandler: (fn: Handler) => (captured.check = fn),
      setDevicePermissionHandler: (fn: Handler) => (captured.device = fn),
      setBluetoothPairingHandler: (fn: Handler) => (captured.bluetooth = fn),
      setCertificateVerifyProc: (fn: Handler) => (captured.certificate = fn),
      setUserAgent: (value: string) => (captured.userAgent = (() => value) as Handler),
      getUserAgent: () => 'Mozilla/5.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36',
    },
  };
}

function fakeContents(url = 'https://example.com/') {
  const listeners = new Map<string, Handler>();
  return {
    id: 7,
    listeners,
    contents: {
      id: 7,
      getURL: () => url,
      setWindowOpenHandler: (fn: Handler) => listeners.set('window-open', fn),
      on: (event: string, fn: Handler) => listeners.set(event, fn),
    },
    fire(event: string, ...args: unknown[]) {
      return (listeners.get(event) as ((...a: unknown[]) => unknown) | undefined)?.(...args);
    },
  };
}

function fakeDelegate(stored: Record<string, PermissionDecision> = {}) {
  const asked: { origin: string; kind: PermissionKind }[] = [];
  const opened: string[] = [];
  const handed: string[] = [];
  const remembered: Record<string, PermissionDecision> = {};
  let answer: PermissionDecision = 'allow';

  return {
    asked,
    opened,
    handed,
    remembered,
    answerWith: (decision: PermissionDecision) => (answer = decision),
    delegate: {
      requestPermission: async (input: { origin: string; kind: PermissionKind }) => {
        asked.push({ origin: input.origin, kind: input.kind });
        return answer;
      },
      openInNewTab: (url: string) => opened.push(url),
      confirmExternalOpen: async (url: string) => {
        handed.push(url);
        return false;
      },
      getStoredDecision: (origin: string, kind: string) => stored[`${origin}|${kind}`] ?? null,
      rememberDecision: (origin: string, kind: string, decision: PermissionDecision) => {
        remembered[`${origin}|${kind}`] = decision;
      },
    },
  };
}

const ask = async (captured: Record<string, Handler>, permission: string, url = 'https://example.com/page') => {
  let allowed: boolean | undefined;
  await (captured.request as unknown as (c: unknown, p: string, cb: (v: boolean) => void, d: unknown) => void)(
    fakeContents(url).contents,
    permission,
    (value) => (allowed = value),
    { requestingUrl: url },
  );
  // The handler resolves a promise before calling back.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return allowed;
};

describe('permissions a page asks for', () => {
  let fake: ReturnType<typeof fakeSession>;
  let delegated: ReturnType<typeof fakeDelegate>;

  beforeEach(() => {
    fake = fakeSession();
    delegated = fakeDelegate();
    hardenWebSession(fake.session as never, delegated.delegate as never);
  });

  it.each(['fullscreen', 'pointerLock', 'clipboard-sanitized-write'])(
    'allows %s without interrupting anyone',
    async (permission) => {
      expect(await ask(fake.captured, permission)).toBe(true);
      expect(delegated.asked).toHaveLength(0);
    },
  );

  // A prompt nobody can evaluate is worse than a quiet no, so these are
  // refused outright rather than asked about.
  it.each([
    'serial',
    'hid',
    'usb',
    'idle-detection',
    'local-fonts',
    'window-placement',
    'storage-access',
    'invented',
  ])('denies %s without asking', async (permission) => {
    expect(await ask(fake.captured, permission)).toBe(false);
    expect(delegated.asked).toHaveLength(0);
  });

  it('asks about the ones a person can judge', async () => {
    expect(await ask(fake.captured, 'geolocation')).toBe(true);
    expect(delegated.asked).toEqual([{ origin: 'https://example.com', kind: 'geolocation' }]);
  });

  it('honours a refusal', async () => {
    delegated.answerWith('deny');
    expect(await ask(fake.captured, 'media')).toBe(false);
  });

  it('remembers the answer so the same site is not asked twice', async () => {
    await ask(fake.captured, 'notifications');
    expect(delegated.remembered['https://example.com|notifications']).toBe('allow');
  });

  it('uses a stored decision without asking again', async () => {
    const stored = fakeDelegate({ 'https://example.com|geolocation': 'deny' });
    const session = fakeSession();
    hardenWebSession(session.session as never, stored.delegate as never);

    expect(await ask(session.captured, 'geolocation')).toBe(false);
    expect(stored.asked).toHaveLength(0);
  });

  // An origin that cannot be named cannot be remembered against, and a prompt
  // saying "null wants your location" is not one anybody can answer.
  it.each(['', 'about:blank', 'data:text/html,x', 'not a url'])('denies a request from %s', async (url) => {
    expect(await ask(fake.captured, 'geolocation', url)).toBe(false);
    expect(delegated.asked).toHaveLength(0);
  });
});

describe('the synchronous permission check', () => {
  it('never prompts, and answers only from what was already decided', () => {
    const fake = fakeSession();
    const delegated = fakeDelegate({ 'https://example.com|geolocation': 'allow' });
    hardenWebSession(fake.session as never, delegated.delegate as never);

    const check = fake.captured.check as unknown as (c: unknown, p: string, o: string) => boolean;
    expect(check(null, 'geolocation', 'https://example.com')).toBe(true);
    expect(check(null, 'geolocation', 'https://other.com')).toBe(false);
    expect(check(null, 'serial', 'https://example.com')).toBe(false);
    expect(check(null, 'fullscreen', 'https://example.com')).toBe(true);
    expect(delegated.asked).toHaveLength(0);
  });
});

describe('devices are refused outright', () => {
  it('denies every device request and refuses to pair bluetooth', () => {
    const fake = fakeSession();
    hardenWebSession(fake.session as never, fakeDelegate().delegate as never);

    expect((fake.captured.device as unknown as () => boolean)()).toBe(false);

    let confirmed: { confirmed: boolean } | undefined;
    (fake.captured.bluetooth as unknown as (d: unknown, cb: (r: { confirmed: boolean }) => void) => void)(
      {},
      (result) => (confirmed = result),
    );
    expect(confirmed).toEqual({ confirmed: false });
  });
});

describe('a page trying to open a window', () => {
  it('never gets one, whatever it asks for', () => {
    const contents = fakeContents();
    const delegated = fakeDelegate();
    guardTabWebContents(contents.contents as never, delegated.delegate as never);

    const result = contents.fire('window-open', { url: 'https://example.com/x', disposition: 'new-window' });
    expect(result).toEqual({ action: 'deny' });
  });

  it('gets a tab instead, when the address is one a page may reach', () => {
    const contents = fakeContents();
    const delegated = fakeDelegate();
    guardTabWebContents(contents.contents as never, delegated.delegate as never);

    contents.fire('window-open', { url: 'https://example.com/x', disposition: 'foreground-tab' });
    expect(delegated.opened).toEqual(['https://example.com/x']);
  });
});

describe('a page trying to navigate itself somewhere', () => {
  const attempt = (url: string) => {
    const contents = fakeContents();
    const delegated = fakeDelegate();
    guardTabWebContents(contents.contents as never, delegated.delegate as never);

    let prevented = false;
    contents.fire('will-navigate', { preventDefault: () => (prevented = true) }, url);
    return { prevented, delegated };
  };

  it.each(['https://example.com/', 'http://example.com/', 'copacetic://start'])('allows %s', (url) => {
    expect(attempt(url).prevented).toBe(false);
  });

  // The split that matters: a user may type a local path, a page may not send
  // a tab to one.
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x'])('refuses %s', (url) => {
    expect(attempt(url).prevented).toBe(true);
  });
});

describe('the chrome document itself', () => {
  it('cannot be navigated away from', () => {
    const contents = fakeContents();
    guardChromeWebContents(contents.contents as never);

    let prevented = false;
    contents.fire('will-navigate', { preventDefault: () => (prevented = true) }, 'https://example.com/');
    expect(prevented).toBe(true);
  });

  it('never opens a window either', () => {
    const contents = fakeContents();
    guardChromeWebContents(contents.contents as never);
    expect(contents.fire('window-open', { url: 'https://example.com/' })).toEqual({ action: 'deny' });
  });

  // Disabled in webPreferences as well; this is the belt to that pair of
  // braces, and the one nothing was checking.
  it('refuses to attach a webview', () => {
    const contents = fakeContents();
    guardChromeWebContents(contents.contents as never);

    let prevented = false;
    contents.fire('will-attach-webview', { preventDefault: () => (prevented = true) }, {}, {});
    expect(prevented).toBe(true);
  });
});

describe('what the browser tells sites it is', () => {
  it('does not advertise Electron', () => {
    const stripped = stripElectronFromUserAgent('Mozilla/5.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36');
    expect(stripped).not.toMatch(/electron/i);
    expect(stripped).toMatch(/Chrome\/120/);
  });

  it('leaves a user agent without Electron alone', () => {
    const plain = 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36';
    expect(stripElectronFromUserAgent(plain)).toBe(plain);
  });
});

describe('isTransportSecure', () => {
  it.each(['https://example.com/', 'http://localhost:3000/', 'http://127.0.0.1/'])('accepts %s', (url) => {
    expect(isTransportSecure(url)).toBe(true);
  });

  it.each(['http://example.com/', 'ftp://example.com/', 'nonsense'])('rejects %s', (url) => {
    expect(isTransportSecure(url)).toBe(false);
  });
});
