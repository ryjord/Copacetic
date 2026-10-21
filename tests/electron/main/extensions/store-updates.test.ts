import { describe, expect, it } from 'vitest';
import {
  asksForMore,
  idsWithNewerVersions,
  isNewerExtensionVersion,
  updateCheckUrl,
} from '../../../../electron/main/extensions/store-updates';

const UBLOCK_ORIGIN_LITE = 'ddkjiahejlhfcafbddmgiahcphecmpfh';
const DARK_READER = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
const UNKNOWN = 'a'.repeat(32);

// The store's answer to a check for these three, as it came back on 21 October 2026, trimmed of its long values.
const ANSWER =
  '<?xml version="1.0" encoding="UTF-8"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0" server="prod">' +
  '<daystart elapsed_days="7233" elapsed_seconds="44717"/>' +
  `<app appid="${UBLOCK_ORIGIN_LITE}" cohort="1::" cohortname="" status="ok"><updatecheck _esbAllowlist="true" codebase="https://clients2.googleusercontent.com/crx/blobs/x.crx" protected="0" size="9172092" status="ok" version="2026.1021.1354"/></app>` +
  `<app appid="${DARK_READER}" cohort="1::" cohortname="" status="ok"><updatecheck _esbAllowlist="true" status="noupdate"/></app>` +
  `<app appid="${UNKNOWN}" status="error-unknownApplication"/></gupdate>`;

describe('asking the store for newer versions', () => {
  it('asks once for every extension, with the version each has', () => {
    const url = new URL(
      updateCheckUrl(
        [
          { id: UBLOCK_ORIGIN_LITE, version: '1.0' },
          { id: DARK_READER, version: '4.9.1' },
        ],
        '146.0.0.0',
      ),
    );
    expect(url.origin).toBe('https://clients2.google.com');
    expect(url.searchParams.get('response')).toBe('updatecheck');
    expect(url.searchParams.getAll('x')).toEqual([
      `id=${UBLOCK_ORIGIN_LITE}&v=1.0&uc`,
      `id=${DARK_READER}&v=4.9.1&uc`,
    ]);
  });

  it('reads only the newer versions from its answer', () => {
    const installed = [
      { id: UBLOCK_ORIGIN_LITE, version: '2026.1014.1' },
      { id: DARK_READER, version: '4.9.1' },
      { id: UNKNOWN, version: '1.0' },
    ];
    expect(idsWithNewerVersions(ANSWER, installed)).toEqual([UBLOCK_ORIGIN_LITE]);
  });

  // The store is asked with our version, but its answer is checked rather than trusted.
  it('ignores an offer of the version in use, or an older one, or one we never asked about', () => {
    expect(idsWithNewerVersions(ANSWER, [{ id: UBLOCK_ORIGIN_LITE, version: '2026.1021.1354' }])).toEqual([]);
    expect(idsWithNewerVersions(ANSWER, [{ id: UBLOCK_ORIGIN_LITE, version: '2027.1.1' }])).toEqual([]);
    expect(idsWithNewerVersions(ANSWER, [{ id: DARK_READER, version: '1.0' }])).toEqual([]);
  });

  it('reads nothing from an answer that is not one', () => {
    expect(
      idsWithNewerVersions('<html>Service unavailable</html>', [{ id: UBLOCK_ORIGIN_LITE, version: '1.0' }]),
    ).toEqual([]);
  });
});

describe('which version is newer', () => {
  it.each([
    ['1.10', '1.9', true],
    ['1.0.1', '1.0', true],
    ['1.0', '1.0.0', false],
    ['1.0', '1.0.1', false],
    ['2026.1021.1354', '2026.1014.1', true],
    ['banana', '1.0', false],
  ])('%s over %s: %s', (offered, current, isNewer) => {
    expect(isNewerExtensionVersion(offered, current)).toBe(isNewer);
  });
});

describe('whether an update asks for more', () => {
  const before = { permissions: ['storage', 'tabs'], hostPermissions: ['https://example.com/*'] };

  it('does not, when it asks for the same or for less', () => {
    expect(asksForMore(before, before)).toBe(false);
    expect(asksForMore(before, { permissions: ['storage'], hostPermissions: [] })).toBe(false);
  });

  // Chrome asks again only over what it would warn about, and storage carries no warning.
  it('does not, over a permission Chrome would not warn about', () => {
    expect(asksForMore(before, { ...before, permissions: [...before.permissions, 'alarms'] })).toBe(false);
  });

  it('does, over a new warning or a new site', () => {
    expect(asksForMore(before, { ...before, permissions: [...before.permissions, 'history'] })).toBe(true);
    expect(asksForMore(before, { ...before, hostPermissions: ['<all_urls>'] })).toBe(true);
  });
});
