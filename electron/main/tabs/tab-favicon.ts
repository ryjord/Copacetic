import { isFetchableFavicon } from '../../shared/browsing/url';

export const MAX_FAVICON_BYTES = 200 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** The tab's own session's fetch, passed in so this can be exercised without one. */
export type SessionFetch = (
  url: string,
  options: { bypassCustomProtocolHandlers: boolean; redirect: 'manual'; signal: AbortSignal },
) => Promise<Response>;

/**
 * A page names this URL and the fetch carries whatever cookies the user already
 * holds, so every guard here is refusing an authenticated request to somewhere
 * the user never asked to go.
 */
export async function fetchFaviconDataUrl(
  pageUrl: string,
  faviconUrl: string,
  fetchFromWebSession: SessionFetch,
): Promise<string | null> {
  if (!isFetchableFavicon(pageUrl, faviconUrl)) {
    return null;
  }

  try {
    // Not followed: the guard above judged this address, and a redirect could
    // point the same authenticated request at your router.
    const response = await fetchFromWebSession(faviconUrl, {
      bypassCustomProtocolHandlers: true,
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      return null;
    }

    // Checked before buffering: reading the body first would let a hostile
    // response exhaust main-process memory whatever cap is applied afterwards.
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_FAVICON_BYTES) {
      return null;
    }

    const buffer = await readCapped(response, MAX_FAVICON_BYTES);
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }

    return `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`;
  } catch {
    // A missing favicon is not worth surfacing; the chrome draws a monogram.
    return null;
  }
}

/** The body, read only as far as the cap: a response with no length could otherwise send anything. */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks);
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
