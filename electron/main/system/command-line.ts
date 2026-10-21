/**
 * Copacetic makes no proprietary calls today, and until now that was true
 * because those hooks are absent from an Electron build rather than because
 * anything switched them off. An implicit guarantee is one a Chromium bump can
 * revoke quietly while Settings keeps claiming otherwise, so each one is now
 * turned off by name.
 */

export interface Switch {
  name: string;
  value?: string;
  /** What it stops, in terms of what would otherwise leave this machine. */
  reason: string;
}

/**
 * Chromium features that talk to somebody on their own initiative. Turned off
 * as one switch because that is the shape Chromium takes them in.
 */
const DISABLED_FEATURES = [
  // Scans the local network for Chromecast and similar, unprompted.
  'MediaRouter',
  // Fetches per-site hints from Google, keyed by the sites you visit.
  'OptimizationHints',
  'OptimizationGuideModelDownloading',
  // Offers to translate, which means telling a server what the page says.
  'Translate',
  'TranslateUI',
  // Asks a server how to fill a form, which means describing the form.
  'AutofillServerCommunication',
  // The advertising measurement stack. None of it belongs in a browser that
  // claims to send nothing.
  'PrivacySandboxAdsAPIs',
  'AttributionReporting',
  'TopicsAPI',
  'InterestCohortAPI',
  'FledgeConsiderKAnonymity',
];

/** Features whose dialog Electron never draws; turned off, a site takes the path it takes elsewhere. */
const UNDRAWN_FEATURES = [
  // Google's sign-in button waits on FedCM's account chooser; without it, the button opens its pop-up.
  'FedCm',
];

export const PRIVACY_SWITCHES: readonly Switch[] = [
  {
    name: 'disable-background-networking',
    reason:
      'Stops the periodic requests Chromium makes on its own: component updates, field trials, reliability reports.',
  },
  {
    name: 'disable-component-update',
    reason: 'Stops Chromium fetching its own component updates, which announces this install on a timer.',
  },
  {
    name: 'disable-domain-reliability',
    reason: 'Stops reports about failed loads being uploaded, which would describe where you went and what broke.',
  },
  {
    name: 'no-pings',
    reason: 'Stops the background request a page can ask for when you click a link, which is invisible to you.',
  },
  {
    name: 'disable-sync',
    reason: 'There is no account to sync with, and this makes that structural rather than incidental.',
  },
  {
    name: 'disable-features',
    value: [...DISABLED_FEATURES, ...UNDRAWN_FEATURES].join(','),
    reason:
      'Turns off the Chromium features that contact a server without being asked, and the ones whose dialog Electron never draws.',
  },
];

/** Switches that depend on the system, applied with the ones above. */
export function platformSwitches(platform: NodeJS.Platform): Switch[] {
  // Windows Hello answers passkeys itself; elsewhere Electron draws no dialog for them, so a request waited forever.
  return platform === 'win32'
    ? []
    : [
        {
          name: 'disable-blink-features',
          value: 'WebAuth',
          reason:
            'Tells sites there are no passkeys or security keys here, since Electron has no dialog to answer them, so they offer another way to sign in.',
        },
      ];
}

export interface CommandLine {
  appendSwitch(name: string, value?: string): void;
}

/** Must run before `app.ready`; Chromium reads its command line once. */
export function applyStartupSwitches(commandLine: CommandLine, platform: NodeJS.Platform = process.platform): void {
  for (const entry of [...PRIVACY_SWITCHES, ...platformSwitches(platform)]) {
    if (entry.value === undefined) {
      commandLine.appendSwitch(entry.name);
    } else {
      commandLine.appendSwitch(entry.name, entry.value);
    }
  }
}
