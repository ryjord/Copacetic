import { isFetchableFavicon } from '../shared/url';

export const MAX_FAVICON_BYTES = 200 * 1024;

/** The web session's own fetch, passed in so this can be exercised without one. */
export type SessionFetch = (url: string, options: { bypassCustomProtocolHandlers: boolean }) => Promise<Response>;

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
    const response = await fetchFromWebSession(faviconUrl, { bypassCustomProtocolHandlers: true });
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

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_FAVICON_BYTES) {
      return null;
    }

    return `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`;
  } catch {
    // A missing favicon is not worth surfacing; the chrome draws a monogram.
    return null;
  }
}
