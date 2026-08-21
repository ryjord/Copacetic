import { type DnsSwitches, dnsSwitchesFor } from '../../shared/dns';

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
    value: DISABLED_FEATURES.join(','),
    reason: 'Turns off the Chromium features that contact a server without being asked.',
  },
];

export interface CommandLine {
  appendSwitch(name: string, value?: string): void;
}

/** Must run before `app.ready`; Chromium reads its command line once. */
export function applyPrivacySwitches(commandLine: CommandLine): void {
  for (const entry of PRIVACY_SWITCHES) {
    if (entry.value === undefined) {
      commandLine.appendSwitch(entry.name);
    } else {
      commandLine.appendSwitch(entry.name, entry.value);
    }
  }
}

/**
 * Chromium reads its DNS configuration from the command line, once, before the
 * app is ready — long before the store is built. So this reads the two fields
 * straight off disk. A missing or unreadable file means the system resolver,
 * which is the safe answer rather than a guess.
 */
export function readDnsPreference(settingsPath: string, readFile: (path: string) => string): DnsSwitches | null {
  try {
    const raw: unknown = JSON.parse(readFile(settingsPath));
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const settings = raw as { dnsMode?: unknown; dnsResolverId?: unknown };
    if (settings.dnsMode !== 'encrypted') {
      return null;
    }
    return dnsSwitchesFor('encrypted', typeof settings.dnsResolverId === 'string' ? settings.dnsResolverId : '');
  } catch {
    return null;
  }
}

export function applyDnsSwitches(commandLine: CommandLine, switches: DnsSwitches | null): void {
  if (!switches) {
    return;
  }
  commandLine.appendSwitch('dns-over-https-mode', switches.mode);
  commandLine.appendSwitch('dns-over-https-templates', switches.templates);
}
