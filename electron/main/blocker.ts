import type { Session } from 'electron';
import type { ConnectionEntry } from '../shared/types';

// A small, curated list of domains that exist only to track people across sites.
const TRACKER_DOMAINS: readonly string[] = [
  // Analytics
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'segment.io',
  'segment.com',
  'cdn.segment.com',
  'mixpanel.com',
  'api.mixpanel.com',
  'amplitude.com',
  'api.amplitude.com',
  'heap.io',
  'heapanalytics.com',
  'fullstory.com',
  'hotjar.com',
  'hotjar.io',
  'static.hotjar.com',
  'mouseflow.com',
  'crazyegg.com',
  'luckyorange.com',
  'inspectlet.com',
  'quantserve.com',
  'quantcount.com',
  'scorecardresearch.com',
  'chartbeat.com',
  'static.chartbeat.com',
  'parsely.com',
  'newrelic.com',
  'nr-data.net',
  'clarity.ms',
  'matomo.cloud',
  'statcounter.com',
  'kissmetrics.com',
  'kissmetrics.io',
  'woopra.com',
  'clicktale.net',
  'sessioncam.com',
  'yandex.ru',
  'mc.yandex.ru',

  // Advertising exchanges and networks
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'adnxs.com',
  'adsrvr.org',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'sharethrough.com',
  'indexww.com',
  'casalemedia.com',
  'smartadserver.com',
  'teads.tv',
  'media.net',
  'contextweb.com',
  'bidswitch.net',
  'lijit.com',
  'sovrn.com',
  '33across.com',
  'gumgum.com',
  'triplelift.com',
  'yieldmo.com',
  'districtm.io',
  'zeta.com',
  'amazon-adsystem.com',
  'advertising.com',
  'adform.net',
  'adcolony.com',
  'applovin.com',
  'unityads.unity3d.com',
  'inmobi.com',
  'mopub.com',
  'smaato.net',
  'revcontent.com',
  'mgid.com',
  'zergnet.com',
  'plista.com',
  'ligatus.com',

  // Social widgets used primarily for cross-site tracking
  'connect.facebook.net',
  'pixel.facebook.com',
  'analytics.tiktok.com',
  'ads.tiktok.com',
  'business-api.tiktok.com',
  'ads.linkedin.com',
  'px.ads.linkedin.com',
  'snap.licdn.com',
  'ads-twitter.com',
  'analytics.twitter.com',
  'static.ads-twitter.com',
  'ct.pinterest.com',
  'analytics.snapchat.com',
  'sc-static.net',
  'tr.snapchat.com',

  // Identity graphs and data brokers
  'crwdcntrl.net',
  'bluekai.com',
  'demdex.net',
  'everesttech.net',
  'omtrdc.net',
  'agkn.com',
  'rlcdn.com',
  'liadm.com',
  'id5-sync.com',
  'crsspxl.com',
  'exelator.com',
  'tapad.com',
  'towerdata.com',
  'addthis.com',
  'sharethis.com',
  'permutive.com',
  'branch.io',
  'app-measurement.com',
  'onesignal.com',
  'braze.com',
  'iterable.com',
  'customer.io',
  'intercom.io',
  'drift.com',
];

/** Resource kinds that are never worth blocking, whatever the domain. */
const ALWAYS_ALLOWED_RESOURCES = new Set(['mainFrame']);

/** A page can name endless subdomains; the log must not grow without limit. */
const MAX_HOSTS_PER_TAB = 250;

export class ContentBlocker {
  private readonly blocked = new Set(TRACKER_DOMAINS);
  private enabled: boolean;
  /** Per-tab counters, keyed by the webContents id of the tab's view. */
  private readonly counts = new Map<number, number>();
  /** Every host each tab has contacted this page load, keyed the same way. */
  private readonly hosts = new Map<number, Map<string, ConnectionEntry>>();
  /** The site each tab is on, so a per-site exception can be honoured. */
  private readonly pageHosts = new Map<number, string>();
  /** Sites the user has chosen to stop blocking on, by registrable domain. */
  private allowed = new Set<string>();
  private onCountChanged: ((webContentsId: number, count: number) => void) | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // Sites where blocking is switched off, by registrable domain.
  setAllowlist(sites: readonly string[]): void {
    this.allowed = new Set(sites);
  }

  /** Told on navigation, so a request can be judged against the page it is for. */
  setPageSite(webContentsId: number, site: string): void {
    if (site) {
      this.pageHosts.set(webContentsId, site);
    } else {
      this.pageHosts.delete(webContentsId);
    }
  }

  isAllowedOn(site: string): boolean {
    return this.allowed.has(site);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  get ruleCount(): number {
    return this.blocked.size;
  }

  onCount(listener: (webContentsId: number, count: number) => void): void {
    this.onCountChanged = listener;
  }

  countFor(webContentsId: number): number {
    return this.counts.get(webContentsId) ?? 0;
  }

  resetCount(webContentsId: number): void {
    // A new page load starts a new log: the previous page's hosts say nothing
    // about this one.
    this.hosts.delete(webContentsId);
    if (this.counts.get(webContentsId)) {
      this.counts.set(webContentsId, 0);
      this.onCountChanged?.(webContentsId, 0);
    }
  }

  forget(webContentsId: number): void {
    this.counts.delete(webContentsId);
    this.hosts.delete(webContentsId);
    this.pageHosts.delete(webContentsId);
  }

  attach(session: Session): void {
    session.webRequest.onBeforeRequest((details, callback) => {
      let hostname: string;
      try {
        hostname = new URL(details.url).hostname.toLowerCase();
      } catch {
        callback({ cancel: false });
        return;
      }

      // Top-level navigation is never blocked, so a tracker domain stays
      // visitable on purpose.
      const isTracker = this.matches(hostname);
      const id = details.webContentsId;
      // An exception applies to the site being browsed, not the host being
      // requested: "allow trackers on this site", not "trust this tracker".
      const pageSite = typeof id === 'number' ? (this.pageHosts.get(id) ?? '') : '';
      const exempt = pageSite !== '' && this.allowed.has(pageSite);

      const shouldBlock = this.enabled && isTracker && !exempt && !ALWAYS_ALLOWED_RESOURCES.has(details.resourceType);

      // Recorded whether or not it was blocked, and whether or not blocking is
      // even switched on. The count of what was stopped is only half the truth;
      // the other half is everything that was allowed through, which no
      // mainstream browser shows without opening developer tools.
      if (typeof id === 'number') {
        this.record(id, hostname, isTracker, shouldBlock);
      }

      if (!shouldBlock) {
        callback({ cancel: false });
        return;
      }

      if (typeof id === 'number') {
        const next = (this.counts.get(id) ?? 0) + 1;
        this.counts.set(id, next);
        this.onCountChanged?.(id, next);
      }
      callback({ cancel: true });
    });
  }

  /** Bounded so a page making requests to endless subdomains cannot grow it. */
  private record(webContentsId: number, host: string, isTracker: boolean, wasBlocked: boolean): void {
    let hosts = this.hosts.get(webContentsId);
    if (!hosts) {
      hosts = new Map();
      this.hosts.set(webContentsId, hosts);
    }

    const existing = hosts.get(host);
    if (existing) {
      existing.requests += 1;
      if (wasBlocked) {
        existing.blocked += 1;
      }
      return;
    }

    if (hosts.size >= MAX_HOSTS_PER_TAB) {
      return;
    }
    hosts.set(host, { host, requests: 1, blocked: wasBlocked ? 1 : 0, isTracker });
  }

  // Every host this tab has contacted, blocked first and then by volume.
  connectionsFor(webContentsId: number): ConnectionEntry[] {
    const hosts = this.hosts.get(webContentsId);
    if (!hosts) {
      return [];
    }

    return [...hosts.values()].sort((a, b) => {
      if (a.blocked !== b.blocked) {
        return b.blocked - a.blocked;
      }
      if (a.requests !== b.requests) {
        return b.requests - a.requests;
      }
      return a.host.localeCompare(b.host);
    });
  }

  /** Matches the domain itself and any subdomain of it. */
  private matches(rawHostname: string): boolean {
    // `doubleclick.net.` is a fully-qualified name that resolves identically to
    // `doubleclick.net`, and `new URL().hostname` keeps the trailing dot. Left
    // alone it is a one-character bypass of the entire list.
    const hostname = rawHostname.replace(/\.+$/, '');

    if (this.blocked.has(hostname)) {
      return true;
    }
    let index = hostname.indexOf('.');
    while (index !== -1) {
      const parent = hostname.slice(index + 1);
      if (this.blocked.has(parent)) {
        return true;
      }
      index = hostname.indexOf('.', index + 1);
    }
    return false;
  }
}
