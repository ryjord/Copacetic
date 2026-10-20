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

// Chromium's filler brand, and the order of the list, both follow from the major version; see greaseFor.
const GREASE_CHARACTERS = [' ', '(', ':', '-', '.', '/', ')', ';', '=', '?', '_'];
const GREASE_VERSIONS = ['8', '99', '24'];
const BRAND_ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/**
 * The filler entry Chromium adds so that nothing parses the brand list by
 * position, and the order it puts the list in, each worked out from the major
 * version the way Chromium itself does. A fixed filler matched one version of
 * Chrome and contradicted every other.
 */
export function greaseFor(major: number): { brand: string; version: string; order: number[] } {
  const character = (offset: number) => GREASE_CHARACTERS[(major + offset) % GREASE_CHARACTERS.length] ?? ' ';
  return {
    brand: `Not${character(0)}A${character(1)}Brand`,
    version: GREASE_VERSIONS[major % GREASE_VERSIONS.length] ?? '8',
    order: BRAND_ORDERS[major % BRAND_ORDERS.length] ?? [0, 1, 2],
  };
}

// Used when the system's own version cannot be read. On Windows Chrome reports the API contract version, not the OS's.
const PLATFORMS: Record<string, { platform: string; platformVersion: string }> = {
  darwin: { platform: 'macOS', platformVersion: '15.5.0' },
  win32: { platform: 'Windows', platformVersion: '15.0.0' },
  linux: { platform: 'Linux', platformVersion: '6.8.0' },
};

/** What the process actually runs, for the answers Chrome gives in full. */
export interface ActualVersions {
  /** Chromium's own build, such as 150.0.7871.250. */
  chromium?: string;
  /** The operating system's version, as macOS reports it. */
  system?: string;
}

/** What Chrome reports, from what the process actually runs on. Claiming arm on an Intel Mac would contradict WebGL. */
function architectureFor(arch: string): string {
  return arch === 'arm64' || arch === 'arm' ? 'arm' : 'x86';
}

/**
 * The major version is read out of the user agent the session already sends,
 * so the string and the hints cannot drift apart when Chromium is upgraded.
 *
 * The full version is not: the user agent is cut to `150.0.0.0`, as Chrome's
 * own is, but Chrome still answers the full build when a page asks, and a
 * zeroed build next to the Chrome brand is the mark of a browser pretending.
 * Sign-in pages' fraud checks look for exactly that, so the real build is
 * passed in.
 */
export function clientHintsFor(
  userAgent: string,
  platform: string,
  arch = 'x64',
  actual: ActualVersions = {},
): ClientHints | null {
  const version = /Chrome\/((\d+)[\d.]*)/.exec(userAgent);
  const major = version?.[2];
  const reported = version?.[1];
  if (!reported || !major) {
    return null;
  }
  const full = actual.chromium?.startsWith(`${major}.`) ? actual.chromium : reported;

  const system = PLATFORMS[platform];
  if (!system) {
    return null;
  }

  const grease = greaseFor(Number(major));
  const inOrder = (entries: Brand[]) =>
    grease.order.map((index) => entries[index]).filter((entry) => entry !== undefined);
  const platformVersion =
    platform === 'darwin' && actual.system && /^\d+(\.\d+)*$/.test(actual.system)
      ? [...actual.system.split('.'), '0', '0'].slice(0, 3).join('.')
      : system.platformVersion;

  return {
    brands: inOrder([
      { brand: grease.brand, version: grease.version },
      { brand: 'Chromium', version: major },
      { brand: 'Google Chrome', version: major },
    ]),
    fullVersionList: inOrder([
      { brand: grease.brand, version: `${grease.version}.0.0.0` },
      { brand: 'Chromium', version: full },
      { brand: 'Google Chrome', version: full },
    ]),
    fullVersion: full,
    platform: system.platform,
    platformVersion,
    architecture: architectureFor(arch),
    model: '',
    mobile: false,
  };
}

/**
 * The header form, built from the same values as the API above.
 *
 * Only the three Chrome sends unprompted. The rest are high-entropy hints a
 * site has to ask for through `Accept-CH`, and that request is never answered
 * - not deferred, never answered. Sending them unasked would be unlike Chrome
 * and more than anyone needs to know; answering when asked would hand over the
 * full version, the architecture, the bitness and the device model, which is a
 * fingerprint, and no sign-in has ever needed one.
 *
 * The cost is honest and worth writing down: a site that asks and gets silence
 * has learned something about this browser. That is a smaller thing to give
 * away than the answer would be.
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
 *
 * The whole token goes, whatever follows the slash: matching digits alone left
 * `-beta.1` of a prerelease's version behind, a user agent no other browser sends.
 * The Chrome version is cut to its major number, as Chrome's own is, so the build
 * Chromium happens to be on is not one more thing that tells people apart.
 */
export function stripElectronFromUserAgent(userAgent: string): string {
  return userAgent
    .replace(/ Electron\/\S+/gi, '')
    .replace(/ Copacetic\/\S+/gi, '')
    .replace(/Chrome\/(\d+)[\d.]*/, 'Chrome/$1.0.0.0')
    .trim();
}
