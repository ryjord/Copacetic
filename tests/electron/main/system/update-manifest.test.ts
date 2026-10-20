import { describe, expect, it } from 'vitest';
import { installerFor, plainReleaseNotes, readManifestFiles } from '../../../../electron/main/system/update-manifest';

// The shape electron-builder wrote for 2.0.0-beta.2, kept whole.
const MANIFEST = `version: 2.0.0-beta.2
files:
  - url: Copacetic-2.0.0-beta.2.dmg
    sha512: ri0IpYQkDap3WcW0s28AU74mURfsNLX3YOsRlZeJiX6uz2lCl7C3Ov+rUC3mtg606iwnsagSkxiAp3KlEBMeqw==
    size: 132044089
  - url: Copacetic-2.0.0-beta.2-arm64.dmg
    sha512: uzUZ9cnpUHH/YnsDL1OoMshVY1oqx/Scrp8VABigNM9e9DOK6+rdbvOIwBeAmCeypGFLrs25Ha1lpOk+SrUEfA==
    size: 127332108
path: Copacetic-2.0.0-beta.2.dmg
sha512: ri0IpYQkDap3WcW0s28AU74mURfsNLX3YOsRlZeJiX6uz2lCl7C3Ov+rUC3mtg606iwnsagSkxiAp3KlEBMeqw==
releaseDate: '2026-10-19T22:36:53.229Z'
`;

describe('the release manifest', () => {
  it('lists each disk image with its hash and size', () => {
    const files = readManifestFiles(MANIFEST);
    expect(files.map((file) => file.url)).toEqual(['Copacetic-2.0.0-beta.2.dmg', 'Copacetic-2.0.0-beta.2-arm64.dmg']);
    expect(files[1]?.size).toBe(127332108);
    expect(files[1]?.sha512).toMatch(/^uzUZ9/);
  });

  it('picks the image built for this Mac', () => {
    const files = readManifestFiles(MANIFEST);
    expect(installerFor(files, 'arm64')?.url).toBe('Copacetic-2.0.0-beta.2-arm64.dmg');
    expect(installerFor(files, 'x64')?.url).toBe('Copacetic-2.0.0-beta.2.dmg');
  });

  it('finds nothing in what is not a manifest', () => {
    expect(readManifestFiles('<html>Not found</html>')).toEqual([]);
  });
});

describe('release notes as text', () => {
  it('drops the Markdown marks and keeps the lines', () => {
    expect(plainReleaseNotes('### New\n\n- **Split view.** Two tabs side by side.\n- Undo.')).toBe(
      'New\n\n· Split view. Two tabs side by side.\n· Undo.',
    );
  });

  it('says nothing for empty notes, and shortens long ones at a line', () => {
    expect(plainReleaseNotes('   ')).toBeNull();
    const long = Array.from({ length: 100 }, (_unused, index) => `- Line ${index} of the notes`).join('\n');
    const shortened = plainReleaseNotes(long) ?? '';
    expect(shortened.length).toBeLessThanOrEqual(1202);
    expect(shortened.endsWith('\n…')).toBe(true);
  });
});
