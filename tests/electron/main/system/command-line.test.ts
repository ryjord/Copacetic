import { describe, expect, it } from 'vitest';
import { PRIVACY_SWITCHES, applyPrivacySwitches } from '../../../../electron/main/system/command-line';

function recorder() {
  const applied: { name: string; value?: string }[] = [];
  return {
    applied,
    appendSwitch: (name: string, value?: string) => {
      applied.push(value === undefined ? { name } : { name, value });
    },
  };
}

/**
 * Copacetic contacted nobody on its own before this existed - but only because
 * those hooks are absent from an Electron build, not because anything turned
 * them off. An implicit guarantee is one a Chromium bump can revoke quietly
 * while Settings goes on claiming otherwise.
 */
describe('the switches that make silence deliberate', () => {
  it('applies every one of them', () => {
    const commandLine = recorder();
    applyPrivacySwitches(commandLine, 'win32');
    expect(commandLine.applied).toHaveLength(PRIVACY_SWITCHES.length);
  });

  // Electron draws no passkey dialog outside Windows, so sites are told there is no WebAuthn and offer another way in.
  it.each([
    ['darwin', true],
    ['linux', true],
    ['win32', false],
  ] as const)('on %s, takes passkeys away from pages: %s', (platform, isTakenAway) => {
    const commandLine = recorder();
    applyPrivacySwitches(commandLine, platform);
    const blink = commandLine.applied.find((entry) => entry.name === 'disable-blink-features');
    expect(blink?.value === 'WebAuth').toBe(isTakenAway);
  });

  it.each([
    ['turns off periodic requests Chromium makes on its own', 'switch', 'disable-background-networking'],
    ['turns off component updates announcing this install', 'switch', 'disable-component-update'],
    ['turns off reports describing where you went and what broke', 'switch', 'disable-domain-reliability'],
    ['turns off the invisible request a link can ask for', 'switch', 'no-pings'],
    ['disables scanning your network for cast devices', 'feature', 'MediaRouter'],
    ['disables fetching per-site hints keyed by where you go', 'feature', 'OptimizationHints'],
    ['disables telling a server what a page says', 'feature', 'Translate'],
    ['disables describing your forms to a server', 'feature', 'AutofillServerCommunication'],
    ['disables the advertising measurement stack', 'feature', 'PrivacySandboxAdsAPIs'],
    ['disables attribution reporting', 'feature', 'AttributionReporting'],
    ['disables topics', 'feature', 'TopicsAPI'],
    ['disables an account chooser Electron never draws, which stalled Sign in with Google', 'feature', 'FedCm'],
  ])('%s', (_reason, kind, name) => {
    const commandLine = recorder();
    applyPrivacySwitches(commandLine);
    if (kind === 'switch') {
      expect(commandLine.applied.map((entry) => entry.name)).toContain(name);
      return;
    }
    const features = commandLine.applied.find((entry) => entry.name === 'disable-features')?.value ?? '';
    expect(features.split(',')).toContain(name);
  });
});
