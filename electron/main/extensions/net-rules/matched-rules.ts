/** One rule that decided a request, as chrome.declarativeNetRequest.getMatchedRules reports it. */
export interface MatchedRuleInfo {
  rule: { ruleId: number; rulesetId: string };
  tabId: number;
  timeStamp: number;
}

// Chrome's own window: getMatchedRules answers for the last five minutes.
export const MATCHES_KEPT_FOR_MS = 5 * 60_000;
// A page that fires thousands of blocked requests a minute cannot grow this without limit.
export const MATCHES_KEPT_AT_MOST = 5_000;

/** The rules each extension's verdicts came from, for its own report of what it did. */
export class MatchedRules {
  private readonly byExtension = new Map<string, MatchedRuleInfo[]>();

  constructor(private readonly now: () => number = Date.now) {}

  record(extensionId: string, rule: { ruleId: number; rulesetId: string }, tabId: number): void {
    const kept = this.recent(extensionId);
    kept.push({ rule, tabId, timeStamp: this.now() });
    this.byExtension.set(extensionId, kept.slice(-MATCHES_KEPT_AT_MOST));
  }

  /** Newest last, as Chrome lists them; `tabId` and `minTimeStamp` narrow it as getMatchedRules' filter does. */
  list(extensionId: string, filter: { tabId?: number; minTimeStamp?: number } = {}): MatchedRuleInfo[] {
    return this.recent(extensionId).filter(
      (match) =>
        (filter.tabId === undefined || match.tabId === filter.tabId) &&
        (filter.minTimeStamp === undefined || match.timeStamp >= filter.minTimeStamp),
    );
  }

  forget(extensionId: string): void {
    this.byExtension.delete(extensionId);
  }

  private recent(extensionId: string): MatchedRuleInfo[] {
    const since = this.now() - MATCHES_KEPT_FOR_MS;
    return (this.byExtension.get(extensionId) ?? []).filter((match) => match.timeStamp >= since);
  }
}
