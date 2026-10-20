import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getAppPath: () => '/app' }, shell: { openPath: async () => '' } }));

const { chromiumLicencesCandidates } = await import('../../../../electron/main/system/chromium-licences');

// Each platform keeps the page somewhere different, and a source checkout keeps it in the Electron download.
describe("finding Chromium's licences", () => {
  it('looks beside the executable, in Resources, and in the Electron download', () => {
    expect(chromiumLicencesCandidates('/opt/Copacetic/copacetic', '/opt/Copacetic/resources', '/app')).toEqual([
      path.join('/opt/Copacetic', 'LICENSES.chromium.html'),
      path.join('/opt/Copacetic/resources', 'LICENSES.chromium.html'),
      path.join('/app', 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html'),
    ]);
  });
});
