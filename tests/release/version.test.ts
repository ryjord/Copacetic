import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion, parseVersion } from '../../electron/shared/version';

const older = (a: string, b: string) => expect(Math.sign(compareVersions(a, b))).toBe(-1);
const same = (a: string, b: string) => expect(compareVersions(a, b)).toBe(0);

describe('parseVersion', () => {
  it('accepts the shapes VERSIONING.md describes', () => {
    expect(parseVersion('1.2.3')).toEqual({ release: [1, 2, 3], prerelease: [] });
    expect(parseVersion('v1.2.3')).toEqual({ release: [1, 2, 3], prerelease: [] });
    expect(parseVersion('1.2.3-beta.4')).toEqual({ release: [1, 2, 3], prerelease: ['beta', '4'] });
  });

  it('rejects anything that is not a version', () => {
    // Notably the four-number form, which is why it cannot be used at all.
    expect(parseVersion('1.2.3.4')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by each position in turn', () => {
    older('1.0.0', '2.0.0');
    older('1.2.0', '1.3.0');
    older('1.2.3', '1.2.4');
    older('1.9.0', '1.10.0');
  });

  it('treats a leading v and build metadata as noise', () => {
    same('1.2.3', 'v1.2.3');
    same('1.2.3+build.9', '1.2.3');
  });

  // The rule that matters most here: a beta must never look newer than the
  // release it precedes, or every beta tester is told to downgrade.
  it('ranks a prerelease below its own release', () => {
    older('1.2.0-beta.1', '1.2.0');
    older('1.2.0-rc.1', '1.2.0');
    expect(isNewerVersion('1.2.0-beta.1', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.2.0', '1.2.0-beta.1')).toBe(true);
  });

  it('orders the prerelease ladder', () => {
    older('1.2.0-alpha.1', '1.2.0-beta.1');
    older('1.2.0-beta.1', '1.2.0-beta.2');
    older('1.2.0-beta.2', '1.2.0-rc.1');
    older('1.2.0-beta', '1.2.0-beta.1');
  });

  it('ranks numeric identifiers below alphanumeric ones', () => {
    older('1.2.0-1', '1.2.0-alpha');
    older('1.2.0-beta.2', '1.2.0-beta.abc');
  });

  it('still orders a prerelease of a newer version above the current release', () => {
    expect(isNewerVersion('1.3.0-beta.1', '1.2.0')).toBe(true);
  });
});

describe('isNewerVersion', () => {
  it('is false for the same version and for older ones', () => {
    expect(isNewerVersion('1.0.1', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
  });

  it('is true only for a genuinely newer release', () => {
    expect(isNewerVersion('1.1.0', '1.0.1')).toBe(true);
    expect(isNewerVersion('v1.1.0', '1.0.1')).toBe(true);
  });

  // A malformed tag must never be read as an update available.
  it('is false when either side cannot be parsed', () => {
    expect(isNewerVersion('nightly', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.2.3.4', '1.0.1')).toBe(false);
    expect(isNewerVersion('2.0.0', 'unknown')).toBe(false);
  });
});
