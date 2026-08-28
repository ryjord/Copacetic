/**
 * Copacetic presents a plain Chrome user agent, and Chromium's client hints
 * then describe the browser as Chromium without the Google Chrome brand a real
 * Chrome of that version also reports. A site comparing the two — Google's
 * sign-in among them — sees a browser disagreeing with itself.
 *
 * The hints are corrected in the main process through the DevTools protocol,
 * which is how Chromium populates them anyway. Page content still runs no
 * script of ours: this describes the browser, it does not enter the page.
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

const PLATFORMS: Record<string, { platform: string; platformVersion: string; architecture: string }> = {
  darwin: { platform: 'macOS', platformVersion: '15.5.0', architecture: 'arm' },
  win32: { platform: 'Windows', platformVersion: '15.0.0', architecture: 'x86' },
  linux: { platform: 'Linux', platformVersion: '6.8.0', architecture: 'x86' },
};

/**
 * Everything reported is read out of the user agent the session already sends,
 * so the string and the hints cannot drift apart — including when Chromium is
 * upgraded and the version changes underneath.
 */
export function clientHintsFor(userAgent: string, platform: string): ClientHints | null {
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
    architecture: system.architecture,
    model: '',
    mobile: false,
  };
}
