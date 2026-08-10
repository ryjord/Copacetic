import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { APP_HOST, APP_SCHEME, rendererRoot } from './env';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Registered before `app.ready` so the scheme behaves like a real origin:
 * it gets its own storage partition, counts as a secure context, and is not
 * exempted from CSP the way `file://` is.
 */
export function registerAppProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/** Serves the exported Next build. Only ever reads from inside `out/`. */
export function handleAppProtocol(): void {
  const root = rendererRoot();

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== APP_HOST) return new Response('Not found', { status: 404 });

    const pathname = safeDecode(url.pathname);
    if (pathname === null) return new Response('Bad request', { status: 400 });

    const filePath = resolveWithinRoot(root, pathname);
    if (!filePath) return new Response('Forbidden', { status: 403 });

    const resolved = await resolveFile(filePath, root);
    if (!resolved) return new Response('Not found', { status: 404 });

    const contentType = MIME_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream';
    const body = Readable.toWeb(createReadStream(resolved)) as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        // Build output is content-hashed by Next, and the HTML entry must not
        // be cached or an upgrade would keep serving the previous chrome.
        'cache-control': resolved.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  });
}

/**
 * `decodeURIComponent` throws on a malformed escape like `%ZZ`, which would
 * otherwise reject inside the protocol handler rather than answering.
 */
function safeDecode(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    // A null byte truncates a path for some syscalls; nothing legitimate has one.
    return decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

/**
 * Join a request path onto the renderer root, refusing anything that escapes
 * it. `..` in a URL path is normally collapsed by the URL parser, but this is
 * the one place a mistake would expose the whole filesystem.
 *
 * Exported for tests: this is the sandbox boundary for the whole app protocol.
 */
export function resolveWithinRoot(root: string, pathname: string): string | null {
  const candidate = path.resolve(root, `.${path.posix.normalize(pathname)}`);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(rootWithSep) ? candidate : null;
}

/** Static export emits `about.html` for `/about`, and `index.html` for `/`. */
async function resolveFile(candidate: string, root: string): Promise<string | null> {
  const attempts = [candidate, `${candidate}.html`, path.join(candidate, 'index.html')];
  for (const attempt of attempts) {
    if (!resolveWithinRoot(root, path.relative(root, attempt).split(path.sep).join('/'))) continue;
    try {
      const stats = await stat(attempt);
      if (stats.isFile()) return attempt;
    } catch {
      // Try the next shape.
    }
  }
  // Anything unmatched falls back to the single-page entry so client routing
  // keeps working after a reload.
  try {
    const fallback = path.join(root, 'index.html');
    const stats = await stat(fallback);
    if (stats.isFile()) return fallback;
  } catch {
    /* nothing to serve */
  }
  return null;
}
