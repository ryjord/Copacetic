import { describe, expect, it } from 'vitest';
import { clientHintsFor } from '../../electron/shared/client-hints';

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
