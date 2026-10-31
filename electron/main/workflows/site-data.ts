// Utils
import { type ClearChoice, defaultClearChoice } from '../../shared/data/clearing';
import {
  type KeptAboutSites,
  type KeptKind,
  type SiteTraces,
  describeTraces,
  sameSite,
  siteOf,
} from '../../shared/data/forgetting';
import { forgetCertificateExceptions } from '../security/certificate-exceptions';
import { forgetCertificates } from '../security/certificates';
import { t } from '../../shared/i18n/translate';

// Types
import type { ClearDataOptions, Session } from 'electron';
import type { ClearRange } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { DownloadManager } from '../data/downloads';
import type { BrowserStore } from '../data/store';
import type { BlockingPolicy } from '../security/blocking-policy';
import type { SessionRegistry } from '../sessions/session-registry';

// Everything clearData reaches but the cache, which is its own choice, and downloads, which are not site data.
const SITE_STORAGE: NonNullable<ClearDataOptions['dataTypes']> = [
  'backgroundFetch',
  'cookies',
  'fileSystems',
  'indexedDB',
  'localStorage',
  'serviceWorkers',
  'webSQL',
];

interface SiteDataDeps {
  store: BrowserStore;
  sessions: SessionRegistry;
  blocking: BlockingPolicy;
  downloads: DownloadManager;
  notices: NoticeCentre;
  changed: () => void;
}

/** What the browser keeps about sites, and the ways of getting rid of it. */
export class SiteData {
  constructor(private readonly deps: SiteDataDeps) {}

  /**
   * Removes everything known about one site, and says what went.
   *
   * Said afterwards as well as before, because something that vanished quietly
   * is indistinguishable from something that did not work.
   */
  /**
   * Everything this browser knows about one site, including the part that kept
   * you signed in to it.
   *
   * The store forgets what it wrote down - history, icons, certificates, zoom,
   * permissions, blocking exceptions. None of that is the session, and the
   * session is where the sign-in lives: someone told a site had been forgotten
   * could open it and still be logged in, which made the whole sentence a lie.
   *
   * Cookies and site storage go from every session this window has prepared,
   * which is ordinary browsing, Hush, and each group that keeps its own - a
   * group's cookies are still that site's cookies.
   */
  async forget(address: string): Promise<SiteTraces> {
    // Read before the store forgets, because afterwards nothing names them.
    const known = this.deps.store.originsForSite(address);
    this.deps.notices.withdrawUndos();
    const removed = this.deps.store.forgetSite(address);
    const site = siteOf(address);
    const cookies = site ? await this.forgetInSessions([site], known) : 0;
    // The allowlist may have lost an entry, and the blocking policy holds its own copy.
    this.deps.blocking.setAllowlist(this.deps.store.getSettings().blockerAllowlist);

    const downloads = this.deps.downloads.forgetSite(siteOf(address));
    const complete = { ...removed, cookies, downloads };
    this.deps.notices.notify({
      id: `forget-${siteOf(address)}`,
      tone: 'done',
      key: 'forget-site',
      message: t('main.notices.forgotSite', {
        site: siteOf(address),
        traces: describeTraces(complete).toLowerCase(),
      }),
    });
    this.deps.changed();
    return complete;
  }

  /**
   * Removes these sites' cookies and storage from every prepared session, and
   * reports how many cookies went.
   *
   * Cookies are matched by the site they belong to rather than by origin: a
   * cookie set on `.example.com` is example.com's, and clearing by exact origin
   * would leave it. Storage is cleared by origin because that is what the API
   * takes, using the origins the cookies themselves name. `dataTypes` narrows
   * the storage cleared; left out, the cache goes too.
   */
  private async forgetInSessions(
    sites: string[],
    known: string[] = [],
    dataTypes?: ClearDataOptions['dataTypes'],
  ): Promise<number> {
    if (sites.length === 0) {
      return 0;
    }

    let removed = 0;
    for (const { session, cookies } of await this.cookiesForSites(sites)) {
      // `clearData` matches an origin exactly, so every origin the site is known
      // to have has to be named: the ones a cookie points at, the ones this
      // browser saw an icon or a certificate for, and the two obvious spellings.
      // A subdomain that kept storage without a cookie, an icon or a certificate
      // is not reachable from here and is not cleared.
      const origins = new Set<string>([
        ...sites.flatMap((site) => [`https://${site}`, `https://www.${site}`]),
        ...known,
      ]);
      for (const cookie of cookies) {
        const host = (cookie.domain ?? '').replace(/^\./, '');
        const scheme = cookie.secure ? 'https' : 'http';
        origins.add(`${scheme}://${host}`);
        try {
          await session.cookies.remove(`${scheme}://${host}${cookie.path ?? '/'}`, cookie.name);
          removed += 1;
        } catch {
          // A cookie the session will not give up is not a reason to abandon
          // the rest of them, and the count reports what actually went.
        }
      }

      try {
        await session.clearData({ origins: [...origins], ...(dataTypes ? { dataTypes } : {}) });
      } catch {
        // An in-memory session can refuse this. The cookies are already gone,
        // which is the part someone would notice.
      }
    }
    return removed;
  }

  /**
   * The site's cookies in every session that can hold them.
   *
   * Matched by the site a cookie belongs to rather than by origin: a cookie set
   * on `.example.com` is example.com's, and matching exact origins would leave
   * it behind. Used both to count before anything is removed and to remove.
   */
  private async cookiesForSites(sites: string[]): Promise<{ session: Session; cookies: Electron.Cookie[] }[]> {
    const found: { session: Session; cookies: Electron.Cookie[] }[] = [];
    for (const session of this.deps.sessions.siteDataSessions()) {
      try {
        const all = await session.cookies.get({});
        found.push({
          session,
          cookies: all.filter((cookie) => sites.some((site) => sameSite(cookie.domain ?? '', site))),
        });
      } catch {
        found.push({ session, cookies: [] });
      }
    }
    return found;
  }

  /**
   * What will go, said before it goes.
   *
   * The store counts what it wrote down and cannot see a session, so the cookies
   * are added here. Without them the warning understated what forgetting does by
   * exactly the thing people care about - and then the sentence afterwards named
   * a number the sentence before had not mentioned.
   */
  async traces(address: string): Promise<SiteTraces> {
    const site = siteOf(address);
    const found = this.deps.store.tracesOf(address);
    if (!site) {
      return found;
    }
    const perSession = await this.cookiesForSites([site]);
    return {
      ...found,
      cookies: perSession.reduce((total, entry) => total + entry.cookies.length, 0),
      downloads: this.deps.downloads.countForSite(site),
    };
  }

  /** Clears one kind of thing kept about sites, and says it happened. */
  /**
   * What survives a clear, counted where it actually lives.
   *
   * The store owns most of it and the download manager owns the rest, so the
   * two are put together here. Downloads were in neither list: clearing history
   * left downloads.json holding every address and redirect chain, and the pane
   * that exists to say what a clear does not touch did not mention it.
   */
  kept(): KeptAboutSites {
    return { ...this.deps.store.keptAboutSites(), downloads: this.deps.downloads.remembered() };
  }

  clearKept(kind: KeptKind): void {
    this.deps.notices.withdrawUndos();
    if (kind === 'downloads') {
      // The files stay where they were saved. What goes is the record of where
      // they came from, which is browsing.
      this.deps.downloads.clearCompleted();
      this.deps.changed();
      return;
    }
    this.deps.store.clearKept(kind);
    if (kind === 'blockingOff') {
      this.deps.blocking.setAllowlist(this.deps.store.getSettings().blockerAllowlist);
    }
    this.deps.changed();
  }

  async clearBrowsing(range: ClearRange, choice: ClearChoice = defaultClearChoice(range)): Promise<void> {
    this.deps.notices.withdrawUndos();
    // Read before history goes, since afterwards nothing says which sites the range covered.
    const visited = range === 'all' ? [] : this.deps.store.originsVisitedIn(range);
    if (choice.history) {
      this.deps.store.clearHistory(range);
    }
    if (choice.history && range === 'all') {
      // Certificate summaries are browsing data too: they name every host
      // visited this session.
      forgetCertificates();
      forgetCertificateExceptions();
    }
    if (range === 'all' && (choice.siteData || choice.cache)) {
      const parts = { siteData: choice.siteData, cache: choice.cache };
      await Promise.all(
        this.deps.sessions.siteDataSessions().map((session) => this.deps.sessions.clear(session, parts)),
      );
    }
    if (range !== 'all') {
      await this.clearVisited(visited, choice);
    }
    this.deps.changed();
  }

  /**
   * Chromium keeps no time for cookies, storage or the cache, so a range reaches
   * them through the sites visited in it: all of theirs goes, however old.
   */
  private async clearVisited(origins: string[], choice: ClearChoice): Promise<void> {
    const sites = [...new Set(origins.map(siteOf).filter(Boolean))];
    if (choice.siteData) {
      await this.forgetInSessions(sites, origins, SITE_STORAGE);
    }
    if (choice.cache && origins.length > 0) {
      await Promise.all(
        this.deps.sessions.siteDataSessions().map((session) =>
          session.clearData({ origins, dataTypes: ['cache'] }).catch(() => {
            // An in-memory session can refuse this; the rest still clear.
          }),
        ),
      );
    }
  }
}
