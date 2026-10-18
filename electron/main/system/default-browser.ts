import { app, shell } from 'electron';
import { isPageNavigableUrl } from '../../shared/url';
import type { DefaultBrowserStatus } from '../../shared/types';

/**
 * Becoming the default browser is three different features wearing one name.
 * macOS and Linux can be asked directly. Windows 10 and 11 will not let an
 * application make itself the default at all — it can only register that it is
 * capable and send the person to the screen where they choose. A button that
 * claimed otherwise would be the kind of small lie this browser avoids.
 */

// 'default'       already the default
// 'can-ask'       can be asked for, and the system decides
// 'settings-only' only the person can choose, in the system's own settings
// 'unavailable'   a build that must not register itself: it would point the
//                 system at a development binary

const HANDLED = ['http', 'https'] as const;

export function statusFor(platform: string, isPackaged: boolean, isCurrentlyDefault: boolean): DefaultBrowserStatus {
  if (!isPackaged) {
    return 'unavailable';
  }
  if (isCurrentlyDefault) {
    return 'default';
  }
  return platform === 'win32' ? 'settings-only' : 'can-ask';
}

export function defaultBrowserStatus(): DefaultBrowserStatus {
  const isDefault = HANDLED.every((scheme) => app.isDefaultProtocolClient(scheme));
  return statusFor(process.platform, app.isPackaged, isDefault);
}

/**
 * Asks where asking is possible, and opens the right settings screen where it
 * is not. Returns what to tell the person, empty when there is nothing to say.
 */
export async function makeDefaultBrowser(): Promise<string> {
  switch (defaultBrowserStatus()) {
    case 'default':
      return '';
    case 'unavailable':
      return 'A development build cannot be made the default browser.';
    case 'settings-only':
      // Windows decides this itself, and only through its own settings.
      for (const scheme of HANDLED) {
        app.setAsDefaultProtocolClient(scheme);
      }
      await shell.openExternal('ms-settings:defaultapps');
      return 'Windows only lets you choose a default browser yourself. Its settings are open — pick Copacetic there.';
    case 'can-ask': {
      const asked = HANDLED.map((scheme) => app.setAsDefaultProtocolClient(scheme));
      return asked.every(Boolean) ? '' : 'The system did not accept the change.';
    }
  }
}

/**
 * The address another application asked Copacetic to open.
 *
 * Everything here arrives from outside — a command line, or a system event —
 * so it is checked the same way a link from a page is, and for the same
 * reason: nothing else stops a `file:` or `javascript:` argument becoming a tab.
 */
export function urlFromArguments(argv: readonly string[]): string | null {
  for (const argument of argv.slice(1)) {
    if (argument.startsWith('-')) {
      continue;
    }
    if (isPageNavigableUrl(argument)) {
      return argument;
    }
  }
  return null;
}
