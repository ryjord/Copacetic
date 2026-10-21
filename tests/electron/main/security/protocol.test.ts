import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

// `protocol.ts` imports electron for scheme registration; the pure resolver
// under test touches neither it nor the filesystem.
vi.mock('electron', () => ({ protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} } }));

const { resolveWithinRoot } = await import('../../../../electron/main/security/protocol');

// An absolute, normalised root, the shape `rendererRoot()` produces.
const ROOT = path.resolve('/opt/copacetic/out');
const inside = (relative: string) => path.join(ROOT, relative);

/** The only thing that must always hold: nothing served comes from outside. */
function isContained(resolved: string | null): boolean {
  if (resolved === null) {
    return true;
  }
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep);
}

describe('resolveWithinRoot', () => {
  it('resolves ordinary paths inside the root', () => {
    expect(resolveWithinRoot(ROOT, '/index.html')).toBe(inside('index.html'));
    expect(resolveWithinRoot(ROOT, '/_next/static/chunk.js')).toBe(inside('_next/static/chunk.js'));
    expect(resolveWithinRoot(ROOT, '/')).toBe(ROOT);
  });

  // This is the sandbox boundary for the whole app protocol: the one place a mistake would hand the filesystem to the chrome document.
  // Traversal is neutralised by clamping, not by refusing: `..` above an absolute path is dropped, so the request lands somewhere harmless inside the root.
  it.each([
    ['/../../../../etc/passwd', 'plain traversal', 'etc/passwd'],
    ['/../.ssh/id_rsa', 'one level up', '.ssh/id_rsa'],
    ['/foo/../../../../etc/passwd', 'traversal after a real segment', 'etc/passwd'],
    ['/....//....//etc/passwd', 'padded dots', '..../..../etc/passwd'],
    ['//////../../etc/passwd', 'leading slash run', 'etc/passwd'],
    ['/./../../etc/shadow', 'dot then traversal', 'etc/shadow'],
    ['/../../../', 'traversal to filesystem root', ''],
    ['/%2e%2e/%2e%2e/etc/passwd', 'already-decoded escapes', '%2e%2e/%2e%2e/etc/passwd'],
  ])('contains %s (%s) and clamps it under the root', (pathname, _label, clamped) => {
    const resolved = resolveWithinRoot(ROOT, pathname);
    expect(isContained(resolved)).toBe(true);
    expect(resolved).toBe(inside(clamped));
  });

  // `out-secrets` shares a prefix with `out` but is not inside it. The check
  // has to compare against root plus a separator, never root alone.
  it('does not mistake a sibling sharing the root prefix for containment', () => {
    const resolved = resolveWithinRoot(ROOT, '/../out-secrets/key.pem');
    expect(isContained(resolved)).toBe(true);
    expect(resolved).not.toBe(`${ROOT}-secrets${path.sep}key.pem`);
    expect(resolveWithinRoot(ROOT, '/../out-secrets/key.pem')).toBe(inside('out-secrets/key.pem'));
  });

  it('keeps names that merely contain dots', () => {
    expect(resolveWithinRoot(ROOT, '/assets/jquery.min.js')).toBe(inside('assets/jquery.min.js'));
    expect(resolveWithinRoot(ROOT, '/..well-known/thing')).toBe(inside('..well-known/thing'));
  });

  it('handles a root given with a trailing separator', () => {
    expect(isContained(resolveWithinRoot(`${ROOT}${path.sep}`, '/../../etc/passwd'))).toBe(true);
  });
});
