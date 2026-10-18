import { type Session, session as electronSession } from 'electron';
import { type TabGroup, groupPartition } from '../../shared/tab-groups';
import type { DownloadManager } from '../data/downloads';
import type { ContentBlocker } from '../security/blocker';
import { type SecurityDelegate, WEB_PARTITION, hardenWebSession, remembersDownloads } from '../security/security';
import { describeError, log } from '../system/diagnostics';

interface SessionRegistryDeps {
  securityDelegate: SecurityDelegate;
  blocker: ContentBlocker;
  downloads: DownloadManager;
  /** Read each time, because groups come and go while the browser runs. */
  groups: () => readonly TabGroup[];
}

/**
 * The only place a web session is made, and every guard is installed before
 * anything can run in it.
 *
 * There are three kinds of session, not two, and only two of them were ever
 * set up. A group that keeps its own browsing gets `persist:copacetic-group-<id>`,
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
  private readonly prepared = new Set<string>();

  constructor(private readonly deps: SessionRegistryDeps) {}

  prepare(partition: string): Session {
    const session = electronSession.fromPartition(partition);
    if (this.prepared.has(partition)) {
      return session;
    }
    this.prepared.add(partition);

    hardenWebSession(session, this.deps.securityDelegate);
    this.deps.blocker.attach(session);
    // Everything but Hush is remembered. A Hush download's address, redirect
    // chain and time are browsing, and the tab's whole claim is that none of
    // that is written down.
    this.deps.downloads.attach(session, remembersDownloads(partition));
    return session;
  }

  /**
   * Every session that can hold site data: the shared one, any opened this run,
   * and every group's own whether or not a tab of it has been opened yet.
   */
  siteDataSessions(): Session[] {
    const partitions = new Set([WEB_PARTITION, ...this.prepared]);
    for (const group of this.deps.groups()) {
      if (group.ownSession) {
        partitions.add(groupPartition(group.id));
      }
    }
    return [...partitions].map((partition) => this.prepare(partition));
  }

  async clear(session: Session): Promise<void> {
    try {
      await session.clearStorageData();
      await session.clearCache();
    } catch (error) {
      log.warn('could not clear a session', describeError(error));
    }
  }

  clearGroup(groupId: string): Promise<void> {
    return this.clear(this.prepare(groupPartition(groupId)));
  }
}
