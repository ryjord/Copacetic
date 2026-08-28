/**
 * What Copacetic says it is.
 *
 * It presents a plain Chrome user agent, and then has to behave like one
 * consistently: Electron leaves gaps a real Chrome does not have, and a browser
 * that contradicts itself is both a thing to fingerprint and a thing sign-in
 * pages refuse. Everything here is derived from the user agent the session
 * already sends, so no two answers can drift apart.
 *
 * This file decides. `electron/main/system/browser-identity.ts` applies it.
 */
export interface Brand {
  brand: string;
  version: string;
}

/** The shape `Emulation.setUserAgentOverride` takes. */
export interface ClientHints {
  brands: Brand[];
  fullVersionList: Brand[];
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
}

/** Chromium's own filler entry, present so that nothing parses the list by position. */
const GREASE: Brand = { brand: 'Not;A=Brand', version: '8' };
const GREASE_FULL: Brand = { brand: 'Not;A=Brand', version: '8.0.0.0' };

const PLATFORMS: Record<string, { platform: string; platformVersion: string }> = {
  darwin: { platform: 'macOS', platformVersion: '15.5.0' },
  win32: { platform: 'Windows', platformVersion: '15.0.0' },
  linux: { platform: 'Linux', platformVersion: '6.8.0' },
};

/** What Chrome reports, from what the process actually runs on. Claiming arm on an Intel Mac would contradict WebGL. */
function architectureFor(arch: string): string {
  return arch === 'arm64' || arch === 'arm' ? 'arm' : 'x86';
}

/**
 * Everything reported is read out of the user agent the session already sends,
 * so the string and the hints cannot drift apart — including when Chromium is
 * upgraded and the version changes underneath.
 */
export function clientHintsFor(userAgent: string, platform: string, arch = 'x64'): ClientHints | null {
  const version = /Chrome\/((\d+)[\d.]*)/.exec(userAgent);
  const full = version?.[1];
  const major = version?.[2];
  if (!full || !major) {
    return null;
  }

  const system = PLATFORMS[platform];
  if (!system) {
    return null;
  }

  return {
    brands: [GREASE, { brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }],
    fullVersionList: [GREASE_FULL, { brand: 'Chromium', version: full }, { brand: 'Google Chrome', version: full }],
    fullVersion: full,
    platform: system.platform,
    platformVersion: system.platformVersion,
    architecture: architectureFor(arch),
    model: '',
    mobile: false,
  };
}

/**
 * The header form, built from the same values as the API above.
 *
 * Only the three Chrome sends unprompted. The rest are high-entropy hints a
 * site has to ask for, and sending them unasked is both unlike Chrome and more
 * than anyone needs to know.
 */
export function clientHintHeaders(hints: ClientHints): Record<string, string> {
  const list = (brands: Brand[]) => brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(', ');
  return {
    'sec-ch-ua': list(hints.brands),
    'sec-ch-ua-mobile': hints.mobile ? '?1' : '?0',
    'sec-ch-ua-platform': `"${hints.platform}"`,
  };
}

/**
 * The languages a request offers. Chromium sends only the one locale it was
 * started with; Chrome widens it to the base language and English, which is
 * what a site is used to seeing.
 */
export function acceptLanguagesFor(locale: string): string {
  const tag = locale || 'en-US';
  const base = tag.split('-')[0] ?? 'en';
  const languages = [tag];

  // A regional English needs no separate base entry: English arrives below
  // anyway. Any other language keeps its base directly after it.
  if (base !== tag && base !== 'en') {
    languages.push(base);
  }
  for (const fallback of ['en-US', 'en']) {
    if (!languages.includes(fallback)) {
      languages.push(fallback);
    }
  }
  return languages.join(',');
}

/**
 * What a real Chrome has on `window.chrome` and Electron leaves empty. It holds
 * nothing of the browser's: three objects a page can already expect, so that a
 * site checking for them does not conclude it is somewhere unusual.
 */
export const CHROME_OBJECT_SCRIPT = `(() => {
  if (!window.chrome || Object.keys(window.chrome).length) { return; }
  const started = Date.now();
  window.chrome.csi = () => ({ startE: started, onloadT: started, pageT: Date.now() - started, tran: 15 });
  window.chrome.loadTimes = () => ({ commitLoadTime: started / 1000, finishLoadTime: started / 1000 });
  window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
  };
})()`;

/**
 * A site claiming to be Electron invites bespoke, often broken code paths.
 * Presenting as plain Chrome is both better for compatibility and one less
 * signal that fingerprints this user as unusual.
 */
export function stripElectronFromUserAgent(userAgent: string): string {
  return userAgent
    .replace(/ Electron\/[\d.]+/, '')
    .replace(/ Copacetic\/[\d.]+/, '')
    .trim();
}
