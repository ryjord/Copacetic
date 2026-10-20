// Libs
import { type BrowserWindow, app, dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';

// Utils
import { sanitiseChromeText } from '../../shared/chrome/chrome-text';
import { isAskablePermission } from '../../shared/types';
import { hostOf, isPageNavigableUrl } from '../../shared/browsing/url';
import { t } from '../../shared/i18n/translate';

// Types
import type { PermissionAnswer, PermissionPrompt, TabId } from '../../shared/types';
import type { PendingPrompts } from './pending-prompts';
import type { BrowserStore } from '../data/store';

/** What a page's request needs of the tabs, answered by whichever window holds the page. */
export interface TabDirectory {
  tabIdForWebContentsId(webContentsId: number): TabId | null;
  urlFor(id: TabId): string | null;
  create(url: string, options: { activate?: boolean; openerWebContentsId?: number }): void;
  /** A page a tab opened, made a tab of its own with its opener kept; null when the opener is not a tab. */
  adopt(
    contents: Electron.WebContents,
    url: string,
    options: { activate: boolean; openerWebContentsId: number },
  ): boolean;
}
import { describeAuthPrompt, isPromptWorthy } from './auth';
import type { SecurityDelegate } from './security';

// Schemes that are never passed to `shell.openExternal`, whatever the user answers to the confirmation dialog.
const NEVER_HANDED_TO_OS = new Set(['javascript:', 'data:', 'blob:', 'vbscript:', 'filesystem:', 'file:', 'about:']);

/**
 * Everything refused for navigation reaches the external-open path too, so
 * without this the schemes the security model rejects would just be handed to
 * whichever application the OS associates with them, routing around the
 * refusal rather than enforcing it.
 */
export function mayBeHandedToOs(url: string): boolean {
  const scheme = safeScheme(url);
  if (!scheme) {
    return false;
  }
  return !NEVER_HANDED_TO_OS.has(`${scheme}:`) && !isAbusedHandler(scheme);
}

/**
 * Windows handlers pages have used to run code or fetch files with one click,
 * refused whatever the person answers. A denylist rather than an allowlist,
 * which would quietly break every app link nobody thought to list.
 */
export function isAbusedHandler(scheme: string): boolean {
  const lower = scheme.toLowerCase();
  return (
    lower.startsWith('ms-') ||
    ['search', 'search-ms', 'hcp', 'its', 'mk', 'res', 'shell', 'ldap', 'jar'].includes(lower)
  );
}

/** How long a tab is not asked again after someone said no, so a page cannot stack dialog after dialog. */
export const REFUSED_COOLDOWN_MS = 10_000;

/** One question at a time, and a pause for a tab that has just been told no. */
export class ExternalOpenGate {
  private isAsking = false;
  private readonly refusedAt = new Map<number, number>();

  constructor(private readonly now: () => number = Date.now) {}

  mayAsk(openerWebContentsId: number): boolean {
    const refused = this.refusedAt.get(openerWebContentsId);
    return !this.isAsking && (refused === undefined || this.now() - refused >= REFUSED_COOLDOWN_MS);
  }

  async ask(openerWebContentsId: number, question: () => Promise<boolean>): Promise<boolean> {
    if (!this.mayAsk(openerWebContentsId)) {
      return false;
    }
    this.isAsking = true;
    try {
      const isAllowed = await question();
      if (!isAllowed) {
        this.refusedAt.set(openerWebContentsId, this.now());
      }
      return isAllowed;
    } finally {
      this.isAsking = false;
    }
  }
}

interface BrowserDelegateDeps {
  /** The window a dialog belongs to, if any is open; on macOS there may be none. */
  window: () => BrowserWindow | undefined;
  store: BrowserStore;
  prompts: PendingPrompts;
  /** Read when a page asks, because the sessions it guards are made before the tabs are. */
  tabs: () => TabDirectory;
  onPromptsChanged: () => void;
}

// Attached to a window when there is one, so the question is not lost behind it.
function showQuestion(parent: BrowserWindow | undefined, options: Electron.MessageBoxOptions) {
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

/** What every web session asks of the browser: the person's answers, and where pages may go. */
export function createSecurityDelegate(deps: BrowserDelegateDeps): SecurityDelegate {
  const externalOpens = new ExternalOpenGate();
  return {
    requestPermission: (input) =>
      new Promise<PermissionAnswer>((resolve) => {
        const tabId = deps.tabs().tabIdForWebContentsId(input.webContentsId);
        if (!tabId) {
          resolve({ decision: 'deny', remember: false });
          return;
        }
        const prompt: PermissionPrompt = {
          id: randomUUID(),
          tabId,
          origin: input.origin,
          kind: input.kind,
          description: input.description,
        };
        deps.prompts.addPermission(prompt, resolve);
        deps.onPromptsChanged();
      }),

    adoptOpenedPage: (contents, url, options) => {
      if (!isPageNavigableUrl(url) && url !== '') {
        return false;
      }
      return deps.tabs().adopt(contents, url, options);
    },

    openInNewTab: (url, options) => {
      // Page-initiated, so the strict set: `window.open('file:///…')` must not become a tab.
      if (!isPageNavigableUrl(url)) {
        return;
      }
      deps.tabs().create(url, { activate: options.activate, openerWebContentsId: options.openerWebContentsId });
    },

    confirmExternalOpen: async (url, openerWebContentsId) => {
      const scheme = safeScheme(url);
      if (!scheme || !mayBeHandedToOs(url)) {
        return false;
      }
      const isAllowed = await externalOpens.ask(openerWebContentsId, async () => {
        const { response } = await showQuestion(deps.window(), {
          type: 'question',
          buttons: [t('main.dialogs.common.open'), t('main.dialogs.common.cancel')],
          defaultId: 1,
          cancelId: 1,
          title: t('main.dialogs.externalOpen.title'),
          message: t('main.dialogs.externalOpen.message'),
          detail: t('main.dialogs.externalOpen.detail', { scheme, url: sanitiseChromeText(url, 240) }),
          noLink: true,
        });
        return response === 0;
      });
      if (!isAllowed) {
        return false;
      }
      await shell.openExternal(url);
      return true;
    },

    getStoredDecision: (origin, kind) => deps.store.getPermissionDecision(origin, kind),
    getDefaultPermission: (kind) =>
      isAskablePermission(kind) ? (deps.store.getSettings().permissionDefaults[kind] ?? 'ask') : 'ask',
    rememberDecision: (origin, kind, decision) => deps.store.setPermissionDecision(origin, kind, decision),

    blocksThirdPartyCookiesOn: (site) => {
      const settings = deps.store.getSettings();
      return settings.blockThirdPartyCookies && !settings.blockerAllowlist.includes(site);
    },

    chooseDisplaySource: async (origin, choices) => {
      const host = sanitiseChromeText(hostOf(origin) || origin, 120);
      const { response } = await showQuestion(deps.window(), {
        type: 'question',
        buttons: [...choices.map((choice) => sanitiseChromeText(choice.name, 60)), t('main.dialogs.common.cancel')],
        defaultId: choices.length,
        cancelId: choices.length,
        title: t('main.dialogs.screenShare.title'),
        message: t('main.dialogs.screenShare.message', { host }),
        detail: t('main.dialogs.screenShare.detail'),
        noLink: true,
      });
      return choices[response]?.id ?? null;
    },
  };
}

/**
 * HTTP Basic, Digest and friends, answered through the chrome.
 *
 * Returns the way to stop listening. The listener is on `app`, which outlives
 * any one window, so a window that reopened used to add a second one and every
 * challenge after that was prompted twice.
 */
// Every open profile listens, and a proxy challenge belongs to none of them; the first to see it answers it.
const claimedChallenges = new WeakSet<object>();

export function watchAuthChallenges(deps: BrowserDelegateDeps): () => void {
  const onLogin = (
    event: Electron.Event,
    webContents: Electron.WebContents | null,
    details: Electron.AuthenticationResponseDetails,
    authInfo: Electron.AuthInfo,
    callback: (username?: string, password?: string) => void,
  ) => {
    // Only challenges a person can actually evaluate. A subresource buried in a
    // cross-origin frame gives the user nothing to judge, so it is left to fail
    // the way Chromium would leave it.
    const tabId: TabId | null = webContents ? deps.tabs().tabIdForWebContentsId(webContents.id) : null;
    const tabUrl = tabId ? deps.tabs().urlFor(tabId) : null;
    if (!isPromptWorthy({ isProxy: authInfo.isProxy, challengeUrl: details.url, tabUrl })) {
      return;
    }
    if (claimedChallenges.has(details)) {
      return;
    }
    claimedChallenges.add(details);

    // Taking the event means Copacetic owns the answer; without this Chromium cancels the challenge itself.
    event.preventDefault();
    const id = randomUUID();
    let settled = false;
    const respond = (username?: string, password?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      deps.prompts.forgetAuth(id);
      // Calling back with nothing cancels the challenge, which is what the user asked for by dismissing it.
      if (username === undefined) {
        callback();
      } else {
        callback(username, password);
      }
      deps.onPromptsChanged();
    };

    deps.prompts.addAuth(
      describeAuthPrompt({
        id,
        tabId,
        isProxy: authInfo.isProxy,
        host: authInfo.host,
        port: authInfo.port,
        realm: authInfo.realm,
        scheme: authInfo.scheme,
      }),
      respond,
    );
    deps.onPromptsChanged();
  };

  app.on('login', onLogin);
  return () => {
    app.removeListener('login', onLogin);
  };
}

function safeScheme(url: string): string | null {
  try {
    return new URL(url).protocol.replace(/:$/, '');
  } catch {
    return null;
  }
}
