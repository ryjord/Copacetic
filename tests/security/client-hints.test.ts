import { describe, expect, it } from 'vitest';
import { acceptLanguagesFor, clientHintHeaders, clientHintsFor } from '../../electron/shared/client-hints';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.224 Safari/537.36';

/**
 * The user agent says Chrome. Chromium's own client hints say Chromium and stop
 * there. A site that compares the two sees a browser disagreeing with itself,
 * which is what Google's sign-in refuses.
 */
describe('what the browser says it is', () => {
  it('claims the Chrome brand the user agent already claims', () => {
    const hints = clientHintsFor(CHROME_MAC, 'darwin');
    expect(hints?.brands).toContainEqual({ brand: 'Google Chrome', version: '150' });
    expect(hints?.brands).toContainEqual({ brand: 'Chromium', version: '150' });
  });

  it('keeps the major version for brands and the full one for versions', () => {
    const hints = clientHintsFor(CHROME_MAC, 'darwin');
    expect(hints?.fullVersionList).toContainEqual({ brand: 'Google Chrome', version: '150.0.7871.224' });
    expect(hints?.fullVersion).toBe('150.0.7871.224');
  });

  // Chromium sends a filler brand so that nothing reads the list by position.
  it('keeps the filler brand Chromium itself sends', () => {
    expect(clientHintsFor(CHROME_MAC, 'darwin')?.brands[0]?.brand).toBe('Not;A=Brand');
  });

  /**
   * The version is read from the user agent rather than written down anywhere,
   * so an Electron upgrade cannot leave the two disagreeing — which is the
   * exact fault being fixed.
   */
  it('follows the user agent when Chromium is upgraded', () => {
    const later = CHROME_MAC.replace('150.0.7871.224', '151.0.8000.1');
    const hints = clientHintsFor(later, 'darwin');
    expect(hints?.brands).toContainEqual({ brand: 'Google Chrome', version: '151' });
    expect(hints?.fullVersion).toBe('151.0.8000.1');
  });

  it.each([
    ['darwin', 'macOS'],
    ['win32', 'Windows'],
    ['linux', 'Linux'],
  ])('describes %s as %s', (platform, expected) => {
    expect(clientHintsFor(CHROME_MAC, platform)?.platform).toBe(expected);
  });

  it('says it is not a phone', () => {
    expect(clientHintsFor(CHROME_MAC, 'darwin')?.mobile).toBe(false);
  });
});

describe('when it cannot tell', () => {
  it('says nothing rather than guessing for a user agent without Chrome in it', () => {
    expect(clientHintsFor('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/130.0', 'linux')).toBeNull();
  });

  it('says nothing for a platform it has no description of', () => {
    expect(clientHintsFor(CHROME_MAC, 'aix')).toBeNull();
  });

  it('says nothing for an empty user agent', () => {
    expect(clientHintsFor('', 'darwin')).toBeNull();
  });
});

/**
 * The headers are what a server sees without running anything. Electron sends
 * none at all, which is a contradiction with the user agent visible before a
 * single script executes — and the reason correcting only the page's API was
 * not enough.
 */
describe('what the browser sends on the wire', () => {
  const headers = () => clientHintHeaders(clientHintsFor(CHROME_MAC, 'darwin')!);

  it('sends the brand list in the form Chrome sends it', () => {
    expect(headers()['sec-ch-ua']).toBe('"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"');
  });

  // Chrome sends these only when a site asks for them through Accept-CH.
  // Volunteering them was both unlike Chrome and more than anyone needs.
  it.each(['sec-ch-ua-full-version-list', 'sec-ch-ua-platform-version', 'sec-ch-ua-arch'])(
    'does not volunteer %s',
    (header) => {
      expect(headers()[header]).toBeUndefined();
    },
  );

  it('sends only the three Chrome sends unprompted', () => {
    expect(Object.keys(headers()).sort()).toEqual(['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']);
  });

  it('says it is not a phone, in the boolean form the header uses', () => {
    expect(headers()['sec-ch-ua-mobile']).toBe('?0');
  });

  it('quotes the platform, which the header format requires', () => {
    expect(headers()['sec-ch-ua-platform']).toBe('"macOS"');
  });

  // The wire and the page are built from one object, so they cannot describe
  // two different browsers however either is changed later.
  it('agrees with what the page is told', () => {
    const hints = clientHintsFor(CHROME_MAC, 'darwin')!;
    const onTheWire = clientHintHeaders(hints)['sec-ch-ua'] ?? '';
    for (const brand of hints.brands) {
      expect(onTheWire).toContain(`"${brand.brand}";v="${brand.version}"`);
    }
  });
});

/**
 * Chromium offers only the one locale it was started with. Chrome widens it to
 * the base language and English, and a request carrying a single language where
 * every Chrome carries three is one more way to stand out.
 */
describe('the languages a request offers', () => {
  it('widens a regional English to what Chrome sends', () => {
    expect(acceptLanguagesFor('en-GB')).toBe('en-GB,en-US,en');
  });

  it('keeps a non-English language first, with English behind it', () => {
    expect(acceptLanguagesFor('fr-FR')).toBe('fr-FR,fr,en-US,en');
  });

  it('does not repeat a language it already has', () => {
    expect(acceptLanguagesFor('en-US')).toBe('en-US,en');
    expect(acceptLanguagesFor('en')).toBe('en,en-US');
  });

  it('falls back to a sensible default when there is no locale', () => {
    expect(acceptLanguagesFor('')).toBe('en-US,en');
  });
});
