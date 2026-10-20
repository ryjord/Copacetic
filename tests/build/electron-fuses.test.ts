import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const { build } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  build: { electronFuses?: Record<string, boolean> };
};

// The packaged check runs a tree with the inspector left on, so this is what keeps it off in the release.
describe('the fuses a release is built with', () => {
  it.each([
    ['runAsNode', false],
    ['enableNodeOptionsEnvironmentVariable', false],
    ['enableNodeCliInspectArguments', false],
    ['enableEmbeddedAsarIntegrityValidation', true],
    ['onlyLoadAppFromAsar', true],
    ['grantFileProtocolExtraPrivileges', false],
  ])('%s is %s', (fuse, state) => {
    expect(build.electronFuses?.[fuse]).toBe(state);
  });
});
