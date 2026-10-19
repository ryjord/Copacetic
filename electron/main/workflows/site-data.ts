import type { Session } from 'electron';
import {
  type KeptAboutSites,
  type KeptKind,
  type SiteTraces,
  describeTraces,
  sameSite,
  siteOf,
} from '../../shared/forgetting';
import type { ClearRange } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { DownloadManager } from '../data/downloads';
import type { BrowserStore } from '../data/store';
import type { BlockingPolicy } from '../security/blocking-policy';
import { forgetCertificateExceptions } from '../security/certificate-exceptions';
import { forgetCertificates } from '../security/certificates';
import type { SessionRegistry } from '../sessions/session-registry';

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
    const removed = this.deps.store.forgetSite(address);
    const cookies = await this.forgetInSessions(address, known);
    // The allowlist may have lost an entry, and the blocking policy holds its own copy.
    this.deps.blocking.setAllowlist(this.deps.store.getSettings().blockerAllowlist);

    const complete = { ...removed, cookies };
    this.deps.notices.notify({
      id: `forget-${siteOf(address)}`,
      tone: 'done',
      key: 'forget-site',
      message: `Forgot ${siteOf(address)}: ${describeTraces(complete).toLowerCase()}`,
    });
    this.deps.changed();
    return complete;
  }

  /**
   * Removes the site's cookies and storage from every prepared session, and
   * reports how many cookies went.
   *
   * Cookies are matched by the site they belong to rather than by origin: a
   * cookie set on `.example.com` is example.com's, and clearing by exact origin
   * would leave it. Storage is cleared by origin because that is what the API
   * takes, using the origins the cookies themselves name.
   */
  private async forgetInSessions(address: string, known: string[] = []): Promise<number> {
    const site = siteOf(address);
    if (!site) {
      return 0;
    }

    let removed = 0;
    for (const { session, cookies } of await this.cookiesForSite(site)) {
      // `clearData` matches an origin exactly, so every origin the site is known
      // to have has to be named: the ones a cookie points at, the ones this
      // browser saw an icon or a certificate for, and the two obvious spellings.
      // A subdomain that kept storage without a cookie, an icon or a certificate
      // is not reachable from here and is not cleared.
      const origins = new Set<string>([`https://${site}`, `https://www.${site}`, ...known]);
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
        await session.clearData({ origins: [...origins] });
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
  private async cookiesForSite(site: string): Promise<{ session: Session; cookies: Electron.Cookie[] }[]> {
    const found: { session: Session; cookies: Electron.Cookie[] }[] = [];
    for (const session of this.deps.sessions.siteDataSessions()) {
      try {
        const all = await session.cookies.get({});
        found.push({ session, cookies: all.filter((cookie) => sameSite(cookie.domain ?? '', site)) });
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
    const perSession = await this.cookiesForSite(site);
    return { ...found, cookies: perSession.reduce((total, entry) => total + entry.cookies.length, 0) };
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

  async clearBrowsing(range: ClearRange): Promise<void> {
    this.deps.store.clearHistory(range);
    if (range === 'all') {
      // Certificate summaries are browsing data too: they name every host
      // visited this session.
      forgetCertificates();
      forgetCertificateExceptions();
      await Promise.all(this.deps.sessions.siteDataSessions().map((session) => this.deps.sessions.clear(session)));
    }
    this.deps.changed();
  }
}
