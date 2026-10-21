// Libs
import { appendFileSync } from 'node:fs';

// Types
import type { Session } from 'electron';

/**
 * A record of where a session's requests went and what came back, written only
 * when COPACETIC_REQUEST_LOG names a file: `npm run record-sign-in` sets it so a
 * sign-in that fails shows exactly which request did. Addresses lose their
 * query and fragment, and nothing that was sent or received is written.
 */

// Pages, frames and the calls a page makes for itself; images and scripts only when they fail.
const ALWAYS_LOGGED: ReadonlySet<string> = new Set(['mainFrame', 'subFrame', 'xhr', 'webSocket', 'other']);

interface RequestOutcome {
  url: string;
  method: string;
  resourceType: string;
  statusCode?: number;
  error?: string;
}

/** The address without what follows it, since a query can carry a token. */
export function addressOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'wss:'
      ? `${parsed.origin}${parsed.pathname}`
      : parsed.protocol;
  } catch {
    return 'unreadable';
  }
}

/** One tab-separated line for a request worth recording, or null for one that is not. */
export function describeRequest(outcome: RequestOutcome, partition: string, at: Date): string | null {
  const isFailure = outcome.error !== undefined || (outcome.statusCode ?? 0) >= 400;
  if (!isFailure && !ALWAYS_LOGGED.has(outcome.resourceType)) {
    return null;
  }
  const result = outcome.error ?? String(outcome.statusCode ?? '');
  return [at.toISOString(), partition, outcome.resourceType, outcome.method, result, addressOf(outcome.url)].join(
    '\t',
  );
}

export function startRequestLog(
  session: Session,
  partition: string,
  filePath = process.env.COPACETIC_REQUEST_LOG,
): void {
  if (!filePath) {
    return;
  }
  const record = (outcome: RequestOutcome) => {
    const line = describeRequest(outcome, partition, new Date());
    if (line) {
      appendFileSync(filePath, `${line}\n`, { mode: 0o600 });
    }
  };
  // A completed request also carries error 'net::OK', so only its status says how it went.
  session.webRequest.onCompleted(({ url, method, resourceType, statusCode }) =>
    record({ url, method, resourceType, statusCode }),
  );
  session.webRequest.onErrorOccurred(({ url, method, resourceType, error }) =>
    record({ url, method, resourceType, error }),
  );
}
