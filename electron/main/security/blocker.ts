import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import type { Session } from 'electron';
import type { ConnectionEntry } from '../../shared/types';
import { registrableDomainOf } from '../../shared/url';

/** What a shipped list says about itself, for a pane that has to name it. */
export interface FilterListInfo {
  name: string;
  url: string;
  describe: string;
  rules: number;
  lastModified: string | null;
}

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
  /**
   * The filter lists that ship with the app, or null when there are none.
   *
   * The curated hostnames above are kept whatever this holds. They are a floor:
   * a list that failed to load, or a future list that quietly dropped a host,
   * cannot make this browser block less than it did before it had any list at
   * all.
   */
  private engine: FiltersEngine | null = null;
  private listedRules = 0;
  private lists: FilterListInfo[] = [];
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

  /**
   * Loads the lists built into this release.
   *
   * Deserialized rather than parsed: the same rules cost about 320ms to read
   * from text and about 10ms in the engine's own format, and that difference
   * would be paid at every launch.
   *
   * A failure is reported and survived. The browser still has its curated
   * hostnames, and blocking less is better than not starting.
   */
  loadShippedLists(directory: string): { rules: number; lists: FilterListInfo[] } | null {
    try {
      const blob = readFileSync(path.join(directory, 'engine.bin'));
      const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as {
        lists?: FilterListInfo[];
      };
      this.engine = FiltersEngine.deserialize(blob);
      this.lists = manifest.lists ?? [];
      this.listedRules = this.lists.reduce((total, list) => total + (list.rules ?? 0), 0);
      return { rules: this.listedRules, lists: this.lists };
    } catch {
      this.engine = null;
      return null;
    }
  }

  /**
   * Fetches the lists again, on request and never otherwise.
   *
   * The whole reason blocking here does not update itself is that a background
   * fetch on a timer is a periodic request from your machine to a server, which
   * is the shape of the thing being blocked. So this exists, and nothing calls
   * it except a person pressing a button.
   *
   * The result is written where the app can find it next launch and loaded now,
   * so a list is never half-applied: either the whole fetch worked and the new
   * rules are running, or nothing changed at all.
   */
  async fetchNewerLists(
    userDataDirectory: string,
    fetchText: (url: string) => Promise<string>,
  ): Promise<{ ok: true; rules: number; lists: FilterListInfo[] } | { ok: false; reason: string }> {
    const sources = this.lists.length > 0 ? this.lists : [];
    if (sources.length === 0) {
      return { ok: false, reason: 'There are no lists to update.' };
    }

    const fetched: { list: FilterListInfo; text: string }[] = [];
    for (const list of sources) {
      let text: string;
      try {
        text = await fetchText(list.url);
      } catch {
        return { ok: false, reason: `${list.name} could not be reached. Nothing was changed.` };
      }
      // A truncated list parses and simply blocks less, which is the one
      // failure nobody would notice. Refuse the whole update instead.
      if (text.length < 100_000 || !text.startsWith('[Adblock')) {
        return { ok: false, reason: `${list.name} did not arrive intact. Nothing was changed.` };
      }
      fetched.push({
        list: {
          ...list,
          rules: text.split('\n').filter((line) => line && !line.startsWith('!')).length,
          lastModified: /^! Last modified: (.+)$/m.exec(text)?.[1]?.trim() ?? list.lastModified,
        },
        text,
      });
    }

    const engine = FiltersEngine.parse(fetched.map((entry) => entry.text).join('\n'));
    const lists = fetched.map((entry) => entry.list);
    const directory = path.join(userDataDirectory, 'filters');

    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'engine.bin'), engine.serialize());
      writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ lists }, null, 2));
    } catch {
      return { ok: false, reason: 'The new lists could not be saved. Nothing was changed.' };
    }

    this.engine = engine;
    this.lists = lists;
    this.listedRules = lists.reduce((total, list) => total + list.rules, 0);
    return { ok: true, rules: this.listedRules, lists };
  }

  /** What is loaded, for a settings pane that has to say which list is running. */
  listInfo(): { rules: number; lists: FilterListInfo[]; curatedHosts: number } {
    return { rules: this.listedRules, lists: this.lists, curatedHosts: this.blocked.size };
  }

  /**
   * What a page should be told to hide.
   *
   * A blocked advert leaves a hole the page still lays out around. This is the
   * stylesheet that collapses it, and it is a stylesheet on purpose: injecting
   * it needs no preload and runs no script of ours in the page, which is a
   * promise this browser has already made and has not spent.
   */
  cosmeticStylesFor(url: string): string {
    if (!this.engine || !this.enabled) {
      return '';
    }
    try {
      const { hostname } = new URL(url);
      if (this.allowed.has(registrableDomainOf(hostname) ?? hostname)) {
        return '';
      }
      const { styles } = this.engine.getCosmeticsFilters({
        url,
        hostname,
        domain: registrableDomainOf(hostname) ?? hostname,
      });
      return styles ?? '';
    } catch {
      return '';
    }
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
      // Two judgements, and either is enough. The curated hostnames are a floor
      // no list can lower; the lists catch what a hostname cannot — a path, a
      // resource type, a first-party script that only ever serves adverts.
      const caughtByHost = this.matches(hostname);
      const caughtByRule = caughtByHost ? null : this.ruleFor(details);
      const isTracker = caughtByHost || caughtByRule !== null;
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
        // The rule is recorded, not only the fact. Which of the two caught
        // something is how a false positive is told from a site that is simply
        // broken, and it is the question you have when a page is wrong.
        this.record(id, hostname, isTracker, shouldBlock, caughtByRule);
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
  /**
   * Whether the lists catch this request, and by which rule.
   *
   * Null when nothing matched, so a caller can tell "no rule" from "a rule with
   * no readable form".
   */
  private ruleFor(details: { url: string; resourceType: string; referrer?: string }): string | null {
    if (!this.engine) {
      return null;
    }
    try {
      const { match, filter } = this.engine.match(
        Request.fromRawDetails({
          url: details.url,
          sourceUrl: details.referrer || undefined,
          type: details.resourceType as never,
        }),
      );
      return match ? (filter?.toString() ?? 'a filter rule') : null;
    } catch {
      return null;
    }
  }

  private record(
    webContentsId: number,
    host: string,
    isTracker: boolean,
    wasBlocked: boolean,
    rule: string | null = null,
  ): void {
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
        existing.rule = existing.rule ?? rule;
      }
      return;
    }

    if (hosts.size >= MAX_HOSTS_PER_TAB) {
      return;
    }
    hosts.set(host, { host, requests: 1, blocked: wasBlocked ? 1 : 0, isTracker, rule: wasBlocked ? rule : null });
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
