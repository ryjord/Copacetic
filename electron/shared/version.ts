// Semver comparison, only as much as this app needs.

interface Parsed {
  release: number[];
  prerelease: string[];
}

/** Accepts an optional leading `v`, which is how the tags are written. */
export function parseVersion(value: string): Parsed | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;

  return {
    release: [Number(match[1]), Number(match[2]), Number(match[3])],
    // Build metadata is deliberately dropped: semver says it never affects
    // precedence, so two builds of the same version are the same version.
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/** Negative when `a` is older, positive when newer, zero when equivalent. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (let i = 0; i < 3; i += 1) {
    const difference = (left.release[i] ?? 0) - (right.release[i] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }

  // A version with a prerelease tag is older than the same version without one.
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    const l = left.prerelease[i];
    const r = right.prerelease[i];
    // A shorter set of identifiers is lower, when all preceding ones are equal.
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;

    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    // Numeric identifiers always rank below alphanumeric ones.
    if (lNumeric && rNumeric) return Number(l) < Number(r) ? -1 : 1;
    if (lNumeric) return -1;
    if (rNumeric) return 1;
    return l < r ? -1 : 1;
  }

  return 0;
}

/** True when `candidate` is a release the running build should offer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  if (!parseVersion(candidate) || !parseVersion(current)) return false;
  return compareVersions(candidate, current) > 0;
}
