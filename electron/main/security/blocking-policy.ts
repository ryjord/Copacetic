/** What one profile chose about blocking, kept apart from the lists every profile shares. */
export class BlockingPolicy {
  /** Sites the person has chosen to stop blocking on, by registrable domain. */
  private allowed: Set<string>;
  private redirect: (details: Electron.OnBeforeRequestListenerDetails) => string | null = () => null;

  constructor(
    private enabled: boolean,
    allowlist: readonly string[] = [],
  ) {
    this.allowed = new Set(allowlist);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setAllowlist(sites: readonly string[]): void {
    this.allowed = new Set(sites);
  }

  isAllowedOn(site: string): boolean {
    return this.allowed.has(site);
  }

  /**
   * Runs before blocking on every request. A session has one onBeforeRequest
   * listener, and the blocker's is it, so anything else that redirects requests goes here.
   */
  setRedirect(redirect: (details: Electron.OnBeforeRequestListenerDetails) => string | null): void {
    this.redirect = redirect;
  }

  redirectFor(details: Electron.OnBeforeRequestListenerDetails): string | null {
    return this.redirect(details);
  }
}
