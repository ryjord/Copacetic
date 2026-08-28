import { existsSync, mkdirSync, renameSync, statSync, appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

/** Values a log line may carry. Structured, so nothing is assembled by hand into a sentence. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const MAX_VALUE_LENGTH = 200;
const DEFAULT_MAX_BYTES = 256 * 1024;

// Anything with a scheme and a host. The host is the part that matters: a log
// naming the sites someone visited is browsing history under another name.
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

// Long unbroken runs of key-shaped characters: tokens, hashes, ciphertext.
const SECRET_LIKE = /\b[A-Za-z0-9+/=_-]{24,}\b/g;

/**
 * What is safe to write down.
 *
 * A diagnostics log is only useful if someone will send it to you, and they can
 * only do that if it holds nothing they would mind sharing. Rather than trusting
 * every call site to remember that, every value written goes through here: an
 * address becomes its scheme, anything key-shaped is removed, and what is left
 * is short.
 */
export function scrub(value: string): string {
  return value
    .replace(URL_LIKE, (match) => `${match.slice(0, match.indexOf(':'))}://<address>`)
    .replace(SECRET_LIKE, '<redacted>')
    .slice(0, MAX_VALUE_LENGTH);
}

function formatFields(fields: LogFields): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${typeof value === 'string' ? scrub(value) : String(value)}`);
  }
  return parts.join(' ');
}

/** What an error can safely contribute: its name and message, scrubbed. Never a stack, which carries paths. */
export function describeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { error: error.name, message: error.message };
  }
  return { error: typeof error, message: String(error) };
}

/**
 * A record of what the app did, kept on the machine and nowhere else.
 *
 * Nothing here is sent anywhere. It exists so that when Copacetic misbehaves on
 * a machine nobody here can reach, there is something to read — and something
 * the person using it can read first, and decide for themselves whether to pass
 * on.
 */
export class Diagnostics {
  private readonly filePath: string;
  private readonly previousPath: string;

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now,
    private readonly maxBytes = DEFAULT_MAX_BYTES,
  ) {
    this.filePath = path.join(dir, 'diagnostics.log');
    this.previousPath = `${this.filePath}.1`;
  }

  get path(): string {
    return this.filePath;
  }

  record(level: LogLevel, event: string, fields: LogFields = {}): void {
    const stamp = new Date(this.now()).toISOString();
    const detail = formatFields(fields);
    this.append(`${stamp} ${level.toUpperCase()} ${scrub(event)}${detail ? ` ${detail}` : ''}\n`);
  }

  info(event: string, fields?: LogFields): void {
    this.record('info', event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.record('warn', event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.record('error', event, fields);
  }

  /** What the log currently holds. For tests, and for showing it to the person it belongs to. */
  read(): string {
    try {
      return existsSync(this.filePath) ? readFileSync(this.filePath, 'utf8') : '';
    } catch {
      return '';
    }
  }

  /** Everything it knows, so a report can carry the run before the one that broke. */
  readAll(): string {
    const previous = existsSync(this.previousPath) ? readFileSync(this.previousPath, 'utf8') : '';
    return previous + this.read();
  }

  clear(): void {
    for (const target of [this.filePath, this.previousPath]) {
      try {
        if (existsSync(target)) {
          unlinkSync(target);
        }
      } catch {
        /* best effort */
      }
    }
  }

  private append(line: string): void {
    // Logging must never be the reason something fails, so every step here is
    // allowed to give up quietly.
    try {
      if (!existsSync(this.dir)) {
        mkdirSync(this.dir, { recursive: true });
      }
      this.rotateIfLarge(line.length);
      appendFileSync(this.filePath, line, 'utf8');
    } catch {
      /* best effort */
    }
  }

  /** One previous file is kept: enough to span a restart, bounded enough to never matter. */
  private rotateIfLarge(incoming: number): void {
    try {
      if (!existsSync(this.filePath) || statSync(this.filePath).size + incoming <= this.maxBytes) {
        return;
      }
      renameSync(this.filePath, this.previousPath);
    } catch {
      /* best effort */
    }
  }
}

/**
 * The one the app uses. It is a module-level handle because the places worth
 * logging from — an uncaught exception, a file that would not write — are
 * exactly the places that cannot be handed a dependency.
 */
let current: Diagnostics | null = null;

export function startDiagnostics(dir: string): Diagnostics {
  current = new Diagnostics(dir);
  return current;
}

export const log = {
  info: (event: string, fields?: LogFields) => current?.info(event, fields),
  warn: (event: string, fields?: LogFields) => current?.warn(event, fields),
  error: (event: string, fields?: LogFields) => current?.error(event, fields),
  path: () => current?.path ?? '',
};
