// Utils
import { app } from '../engine/app';
import { type EngineSession, sessionFor } from '../engine/sessions';
import { type ProfilePartitions, groupPartition, remembersDownloads } from '../../shared/data/partitions';
import { type SecurityDelegate, hardenWebSession } from '../security/security';
import { describeError, log } from '../system/diagnostics';
import { startRequestLog } from '../system/request-log';
import { type SpellcheckChoices, spellcheckLanguagesFor } from '../../shared/chrome/spellcheck';

// Types
import type { TabGroup } from '../../shared/tabs/tab-groups';
import type { DownloadManager } from '../data/downloads';
import type { ContentBlocker } from '../security/blocker';
import type { BlockingPolicy } from '../security/blocking-policy';

interface SessionRegistryDeps {
  partitions: ProfilePartitions;
  securityDelegate: SecurityDelegate;
  blocker: ContentBlocker;
  blocking: BlockingPolicy;
  downloads: DownloadManager;
  /** Read each time, because groups come and go while the browser runs. */
  groups: () => readonly TabGroup[];
  isSpellcheckOn: () => boolean;
  spellcheckLanguages: () => readonly string[];
  /** Told of each session once it is hardened, for the extensions that run there. */
  onPrepared?: (session: EngineSession, partition: string) => void;
}

/**
 * The only place a web session is made, and every guard is installed before
 * anything can run in it.
 *
 * There are three kinds of session, not two, and only two of them were ever
 * set up. A group that keeps its own browsing gets a persistent partition of its own,
 * and nothing hardened it: no permission request handler, so Electron's default
 * applied and the default is to approve; no tracker blocking, while the address
 * bar went on reporting a blocked count of zero; and no download manager, so
 * filenames skipped the sanitising the README promises.
 *
 * The guards were never the problem. Calling them in two places by hand was.
 * Everything goes through here, so a new kind of session cannot be added
 * without being protected.
 */
export class SessionRegistry {
  /** Partitions already hardened, so the work happens once per session. */
  /** Every session made so far, by partition, so a setting can reach each without asking for it again. */
  private readonly prepared = new Map<string, EngineSession>();

  constructor(private readonly deps: SessionRegistryDeps) {}

  prepare(partition: string): EngineSession {
    const session = sessionFor(partition);
    if (this.prepared.has(partition)) {
      return session;
    }
    this.prepared.set(partition, session);

    // Everything but Hush is remembered. A Hush download's address, redirect
    // chain and time are browsing, and the tab's whole claim is that none of
    // that is written down.
    const isRemembered = remembersDownloads(partition);
    hardenWebSession(session, this.deps.securityDelegate, isRemembered);
    this.deps.blocker.attach(session, this.deps.blocking, isRemembered);
    this.deps.downloads.attach(session, isRemembered, partition);
    if (isRemembered) {
      startRequestLog(session, partition);
    }
    session.setSpellCheckerEnabled(this.deps.isSpellcheckOn());
    this.applySpellcheckLanguages(session);
    this.deps.onPrepared?.(session, partition);
    return session;
  }

  /** Told to every session already made, so a change applies without a restart. */
  setSpellcheckLanguages(): void {
    this.prepared.forEach((session) => this.applySpellcheckLanguages(session));
  }

  spellcheckChoices(): SpellcheckChoices {
    const web = this.prepare(this.deps.partitions.web);
    const canChoose = process.platform !== 'darwin';
    return {
      canChoose,
      available: canChoose ? [...web.availableSpellCheckerLanguages] : [],
      inUse: web.getSpellCheckerLanguages(),
    };
  }

  // macOS checks with the system's own speller, and Electron ignores the call there.
  private applySpellcheckLanguages(session: EngineSession): void {
    if (process.platform === 'darwin') {
      return;
    }
    const languages = spellcheckLanguagesFor(
      this.deps.spellcheckLanguages(),
      session.availableSpellCheckerLanguages,
      app.getLocale(),
    );
    try {
      session.setSpellCheckerLanguages(languages);
    } catch (error) {
      log.warn('spellcheck languages were not applied', describeError(error));
    }
  }

  /** Told to every session already made; one made later reads the setting as it is prepared. */
  setSpellcheck(isOn: boolean): void {
    this.prepared.forEach((session) => session.setSpellCheckerEnabled(isOn));
  }

  /**
   * Every session that can hold site data: the shared one, any opened this run,
   * and every group's own whether or not a tab of it has been opened yet.
   */
  siteDataSessions(): EngineSession[] {
    const partitions = new Set([this.deps.partitions.web, ...this.prepared.keys()]);
    for (const group of this.deps.groups()) {
      if (group.ownSession) {
        partitions.add(groupPartition(this.deps.partitions, group.id));
      }
    }
    return [...partitions].map((partition) => this.prepare(partition));
  }

  async clear(session: EngineSession, parts = { siteData: true, cache: true }): Promise<void> {
    try {
      if (parts.siteData) {
        await session.clearStorageData();
      }
      if (parts.cache) {
        await session.clearCache();
      }
    } catch (error) {
      log.warn('could not clear a session', describeError(error));
    }
  }

  clearGroup(groupId: string): Promise<void> {
    return this.clear(this.prepare(groupPartition(this.deps.partitions, groupId)));
  }
}
