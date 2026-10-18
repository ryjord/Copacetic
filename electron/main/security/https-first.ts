import { isPrivateHost } from '../../shared/url';

/** The parts of a request this needs, so it can be tested without Electron. */
export interface UpgradeCandidate {
  url: string;
  method: string;
  resourceType: string;
  webContentsId?: number;
}

/**
 * Every page loaded over HTTPS when the site offers it, and over HTTP only when
 * a person has been told and said yes.
 *
 * The old upgrade rewrote only addresses typed into the omnibox, so a link to
 * http:// went out in the clear, and a typed address whose site had no HTTPS
 * simply failed with nothing to do about it. Upgrading here covers every way a
 * page is reached, and remembering what was upgraded is what lets a failure
 * offer the plain version instead of a dead end.
 */
export class HttpsFirst {
  private enabled: boolean;
  /** Hosts a person chose to visit over HTTP, or that redirected there themselves. Never written down. */
  private readonly plainHosts = new Set<string>();
  /** The last upgrade made for each tab, until its HTTPS page commits. */
  private readonly pending = new Map<number, { host: string; plainUrl: string }>();

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** The address a request should go to instead, or null to let it through. */
  upgradeFor(request: UpgradeCandidate): string | null {
    if (!this.enabled || request.resourceType !== 'mainFrame' || request.method !== 'GET') {
      return null;
    }
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return null;
    }
    // A router, a printer, a dev server: HTTP by design, and the attacker an
    // upgrade guards against sits on the path to a public server.
    if (url.protocol !== 'http:' || isPrivateHost(url.hostname) || this.plainHosts.has(url.host)) {
      return null;
    }

    const id = request.webContentsId;
    const waiting = id === undefined ? undefined : this.pending.get(id);
    if (waiting?.host === url.host) {
      // The HTTPS version sent us back to HTTP. That is the site's answer; asking
      // again would loop, so the host is left alone for the rest of the session.
      this.plainHosts.add(url.host);
      this.pending.delete(id!);
      return null;
    }

    url.protocol = 'https:';
    if (id !== undefined) {
      this.pending.set(id, { host: url.host, plainUrl: request.url });
    }
    return url.toString();
  }

  /**
   * The address bar already turned a typed http:// or bare host into HTTPS, so
   * no request is left for upgradeFor to see. It is recorded here instead, so a
   * typed address fails into the same choice as a followed link.
   */
  typed(webContentsId: number, input: string, target: string): string {
    if (!this.enabled || /^https:/i.test(input.trim())) {
      return target;
    }
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return target;
    }
    if (url.protocol !== 'https:') {
      return target;
    }
    url.protocol = 'http:';
    const plainUrl = url.toString();
    if (this.plainHosts.has(url.host)) {
      return plainUrl;
    }
    this.pending.set(webContentsId, { host: url.host, plainUrl });
    return target;
  }

  /**
   * A page committed. Only a real response settles an upgrade: Chromium commits
   * its error page with no status, and that is exactly when the fallback is needed.
   */
  committed(webContentsId: number, responseCode: number): void {
    if (responseCode > 0) {
      this.pending.delete(webContentsId);
    }
  }

  /** The HTTP address to offer when an upgraded page failed, or null if this failure was not one of ours. */
  fallbackFor(webContentsId: number, failedUrl: string): string | null {
    const waiting = this.pending.get(webContentsId);
    if (!waiting) {
      return null;
    }
    try {
      const failed = new URL(failedUrl);
      return failed.protocol === 'https:' && failed.host === waiting.host ? waiting.plainUrl : null;
    } catch {
      return null;
    }
  }

  /** The person read the warning and chose HTTP for this host, until Copacetic closes. */
  allowPlain(plainUrl: string): boolean {
    try {
      const url = new URL(plainUrl);
      if (url.protocol !== 'http:') {
        return false;
      }
      this.plainHosts.add(url.host);
      return true;
    } catch {
      return false;
    }
  }

  forget(webContentsId: number): void {
    this.pending.delete(webContentsId);
  }
}
