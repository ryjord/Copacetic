import { describe, expect, it, vi } from 'vitest';
import {
  MAX_FAVICON_BYTES,
  fetchFaviconDataUrl,
  fetchImagesWithinBudget,
} from '../../../../electron/main/tabs/tab-favicon';

const PAGE = 'https://example.com/article';

function respondWith({
  ok = true,
  contentType = 'image/png',
  contentLength,
  body = Buffer.from([1, 2, 3]),
}: {
  ok?: boolean;
  contentType?: string;
  contentLength?: string;
  body?: Buffer;
}) {
  const headers = new Headers();
  headers.set('content-type', contentType);
  if (contentLength !== 'none') {
    headers.set('content-length', contentLength ?? String(body.byteLength));
  }
  return vi.fn(
    async () => new Response(new Uint8Array(body), { status: ok ? 200 : 500, headers }),
  ) as unknown as Parameters<typeof fetchFaviconDataUrl>[2] & ReturnType<typeof vi.fn>;
}

describe('fetching an icon a page asked for', () => {
  it('returns a data URL for an ordinary icon', async () => {
    const result = await fetchFaviconDataUrl(PAGE, 'https://example.com/icon.png', respondWith({}));
    expect(result).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}`);
  });

  /**
   * The fetch runs in the web session with the user's cookies, so an icon URL
   * is an authenticated request to anywhere the page names. These are the
   * targets that matters most, and none of them should ever be reached.
   */
  it.each([
    ['a loopback dev server', 'http://127.0.0.1:8080/icon.png'],
    ['a private network address', 'http://192.168.1.1/icon.png'],
    ['cloud instance metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['an intranet host', 'http://router.local/icon.png'],
  ])('refuses %s without making a request', async (_name, faviconUrl) => {
    const fetchImpl = respondWith({});
    expect(await fetchFaviconDataUrl(PAGE, faviconUrl, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a response that is not an image', async () => {
    const result = await fetchFaviconDataUrl(
      PAGE,
      'https://example.com/icon.png',
      respondWith({ contentType: 'text/html' }),
    );
    expect(result).toBeNull();
  });

  it('refuses a failed response', async () => {
    const result = await fetchFaviconDataUrl(PAGE, 'https://example.com/icon.png', respondWith({ ok: false }));
    expect(result).toBeNull();
  });

  // Refused on the declared length, before the body is read: buffering first
  // would exhaust main-process memory whatever cap came afterwards.
  it('refuses an oversized icon on its content-length alone', async () => {
    const fetchImpl = respondWith({ contentLength: String(MAX_FAVICON_BYTES + 1) });
    expect(await fetchFaviconDataUrl(PAGE, 'https://example.com/icon.png', fetchImpl)).toBeNull();
  });

  it('refuses a body that outgrows a small declared length', async () => {
    const result = await fetchFaviconDataUrl(
      PAGE,
      'https://example.com/icon.png',
      respondWith({ contentLength: '10', body: Buffer.alloc(MAX_FAVICON_BYTES + 1) }),
    );
    expect(result).toBeNull();
  });

  it('refuses an empty body rather than producing an empty data URL', async () => {
    const result = await fetchFaviconDataUrl(
      PAGE,
      'https://example.com/icon.png',
      respondWith({ body: Buffer.alloc(0) }),
    );
    expect(result).toBeNull();
  });

  it('survives the request throwing', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as Parameters<typeof fetchFaviconDataUrl>[2];
    expect(await fetchFaviconDataUrl(PAGE, 'https://example.com/icon.png', throwing)).toBeNull();
  });
});

describe('an icon that tries to be more than an icon', () => {
  // The guard judged one address; a redirect could aim the same request at a router.
  it('does not follow redirects', async () => {
    const fetcher = respondWith({});
    await fetchFaviconDataUrl(PAGE, 'https://example.com/icon.png', fetcher);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('gives up on a response that never ends', async () => {
    const fetcher = respondWith({});
    await fetchFaviconDataUrl(PAGE, 'https://example.com/icon.png', fetcher);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // Without a declared length the size was only checked after the whole body was in memory.
  it('stops reading an oversized body that never said how big it was', async () => {
    const huge = Buffer.alloc(MAX_FAVICON_BYTES + 1, 1);
    expect(
      await fetchFaviconDataUrl(
        PAGE,
        'https://example.com/icon.png',
        respondWith({ body: huge, contentLength: 'none' }),
      ),
    ).toBeNull();
  });
});

describe('fetchImagesWithinBudget', () => {
  it('asks a few at a time rather than all at once', async () => {
    let inFlight = 0;
    let mostInFlight = 0;
    const urls = Array.from({ length: 12 }, (_unused, index) => `https://example.com/${index}.png`);
    const found = await fetchImagesWithinBudget(urls, async (url) => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return url.endsWith('3.png') ? null : `data:image/png;base64,${url}`;
    });
    expect(mostInFlight).toBe(4);
    expect(Object.keys(found)).toHaveLength(11);
  });

  it('stops asking once the images add up to the budget', async () => {
    const asked: string[] = [];
    const urls = Array.from({ length: 12 }, (_unused, index) => `https://example.com/${index}.png`);
    await fetchImagesWithinBudget(urls, async (url) => {
      asked.push(url);
      return 'x'.repeat(10 * 1024 * 1024);
    });
    expect(asked).toHaveLength(4);
  });
});
