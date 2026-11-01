// Libs
import { type WriteStream, createWriteStream } from 'node:fs';

// Types
import type { EngineSession } from '../engine/sessions';

/** Where requests went and what came back, only when COPACETIC_REQUEST_LOG names a file; never a query, body or input. */

// Pages, frames and the calls a page makes for itself; images and scripts only when they fail.
const ALWAYS_LOGGED: ReadonlySet<string> = new Set(['mainFrame', 'subFrame', 'xhr', 'webSocket', 'other']);
const WITH_PATH: ReadonlySet<string> = new Set(['http:', 'https:', 'ws:', 'wss:']);

// One stream per file, shared by every session, so no request waits on the disk.
const streams = new Map<string, WriteStream>();

function streamFor(filePath: string): WriteStream {
  const open = streams.get(filePath) ?? createWriteStream(filePath, { flags: 'a', mode: 0o600 });
  streams.set(filePath, open);
  return open;
}

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
    return WITH_PATH.has(parsed.protocol) ? `${parsed.origin}${parsed.pathname}` : parsed.protocol;
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
  session: EngineSession,
  partition: string,
  filePath = process.env.COPACETIC_REQUEST_LOG,
): void {
  if (!filePath) {
    return;
  }
  const stream = streamFor(filePath);
  const record = (outcome: RequestOutcome) => {
    const line = describeRequest(outcome, partition, new Date());
    if (line) {
      stream.write(`${line}\n`);
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
