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
export function fetchFaviconDataUrl(
  pageUrl: string,
  faviconUrl: string,
  fetchFromWebSession: SessionFetch,
): Promise<string | null> {
  return fetchImageDataUrl(pageUrl, faviconUrl, fetchFromWebSession, MAX_FAVICON_BYTES);
}

const IMAGES_AT_ONCE = 4;
// Counted in data URL characters, which run about a third over the bytes they hold.
const MOST_IMAGE_CHARACTERS = 32 * 1024 * 1024;

/**
 * Many images, a few at a time, until they add up to the budget; one that fails is left out.
 *
 * The page chose the addresses and each answer is held whole in the main process, so all at once was every image's
 * worst case added together.
 */
export async function fetchImagesWithinBudget(
  urls: readonly string[],
  fetchOne: (url: string) => Promise<string | null>,
): Promise<Record<string, string>> {
  const batches = Array.from({ length: Math.ceil(urls.length / IMAGES_AT_ONCE) }, (_unused, index) =>
    urls.slice(index * IMAGES_AT_ONCE, (index + 1) * IMAGES_AT_ONCE),
  );
  const fetched: [string, string][] = [];
  let spent = 0;
  for (const batch of batches) {
    if (spent >= MOST_IMAGE_CHARACTERS) {
      break;
    }
    const answers = await Promise.all(batch.map(async (url) => [url, await fetchOne(url)] as const));
    const found = answers.filter((answer): answer is readonly [string, string] => answer[1] !== null);
    spent += found.reduce((total, [, dataUrl]) => total + dataUrl.length, 0);
    fetched.push(...found.map(([url, dataUrl]): [string, string] => [url, dataUrl]));
  }
  return Object.fromEntries(fetched);
}

/** An image a page names, fetched in that page's session under the same guards, as a data URL the chrome can show. */
export async function fetchImageDataUrl(
  pageUrl: string,
  imageUrl: string,
  fetchFromWebSession: SessionFetch,
  maxBytes: number,
): Promise<string | null> {
  if (!isFetchableFavicon(pageUrl, imageUrl)) {
    return null;
  }

  try {
    // Not followed: the guard above judged this address, and a redirect could
    // point the same authenticated request at your router.
    const response = await fetchFromWebSession(imageUrl, {
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
    if (declaredLength > maxBytes) {
      return null;
    }

    const buffer = await readCapped(response, maxBytes);
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
