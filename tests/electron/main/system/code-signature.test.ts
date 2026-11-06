import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false } }));

const { isDeveloperSigned } = await import('../../../../electron/main/system/code-signature');

// What `codesign -dv --verbose=2` writes for each kind of copy.
describe('reading a Mac copy’s signature', () => {
  it('counts a Developer ID signature as signed', () => {
    const output = [
      'Executable=/Applications/Copacetic.app/Contents/MacOS/Copacetic',
      'Identifier=uk.mrenigma.copacetic',
      'Authority=Developer ID Application: Riley Jordan (ABCDE12345)',
      'Authority=Developer ID Certification Authority',
      'Authority=Apple Root CA',
      'TeamIdentifier=ABCDE12345',
    ].join('\n');
    expect(isDeveloperSigned(output)).toBe(true);
  });

  // The releases until now: signed by nobody, which is what macOS treats as a stranger after every update.
  it('does not count an ad-hoc signature', () => {
    expect(isDeveloperSigned('Identifier=uk.co.ryjord.copacetic\nSignature=adhoc\nTeamIdentifier=not set\n')).toBe(
      false,
    );
  });

  it('does not count Apple’s own signature on someone else’s app', () => {
    expect(
      isDeveloperSigned('Authority=Software Signing\nAuthority=Apple Code Signing Certification Authority\n'),
    ).toBe(false);
  });
});
