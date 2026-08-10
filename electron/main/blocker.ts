import type { Session } from 'electron';

/**
 * A small, curated list of domains that exist only to track people across
 * sites. Blocking these is safe: none of them render content a page needs.
 *
 * This is deliberately not a full EasyList implementation. Shipping a 100k-rule
 * filter engine would mean maintaining a filter engine, and a short honest list
 * that never breaks a page is more useful than a long one that sometimes does.
 * The count shown in the chrome is the real number of blocked requests, not an
 * estimate.
 */
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

export class ContentBlocker {
  private readonly blocked = new Set(TRACKER_DOMAINS);
  private enabled: boolean;
  /** Per-tab counters, keyed by the webContents id of the tab's view. */
  private readonly counts = new Map<number, number>();
  private onCountChanged: ((webContentsId: number, count: number) => void) | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
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
    if (this.counts.get(webContentsId)) {
      this.counts.set(webContentsId, 0);
      this.onCountChanged?.(webContentsId, 0);
    }
  }

  forget(webContentsId: number): void {
    this.counts.delete(webContentsId);
  }

  attach(session: Session): void {
    session.webRequest.onBeforeRequest((details, callback) => {
      if (!this.enabled || ALWAYS_ALLOWED_RESOURCES.has(details.resourceType)) {
        callback({ cancel: false });
        return;
      }

      let hostname: string;
      try {
        hostname = new URL(details.url).hostname.toLowerCase();
      } catch {
        callback({ cancel: false });
        return;
      }

      if (!this.matches(hostname)) {
        callback({ cancel: false });
        return;
      }

      const id = details.webContentsId;
      if (typeof id === 'number') {
        const next = (this.counts.get(id) ?? 0) + 1;
        this.counts.set(id, next);
        this.onCountChanged?.(id, next);
      }
      callback({ cancel: true });
    });
  }

  /** Matches the domain itself and any subdomain of it. */
  private matches(rawHostname: string): boolean {
    // `doubleclick.net.` is a fully-qualified name that resolves identically to
    // `doubleclick.net`, and `new URL().hostname` keeps the trailing dot. Left
    // alone it is a one-character bypass of the entire list.
    const hostname = rawHostname.replace(/\.+$/, '');

    if (this.blocked.has(hostname)) return true;
    let index = hostname.indexOf('.');
    while (index !== -1) {
      const parent = hostname.slice(index + 1);
      if (this.blocked.has(parent)) return true;
      index = hostname.indexOf('.', index + 1);
    }
    return false;
  }
}
