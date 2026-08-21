import { describe, expect, it } from 'vitest';
import { PRIVACY_SWITCHES, applyPrivacySwitches } from '../../electron/main/app/command-line';

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
 * Copacetic contacted nobody on its own before this existed — but only because
 * those hooks are absent from an Electron build, not because anything turned
 * them off. An implicit guarantee is one a Chromium bump can revoke quietly
 * while Settings goes on claiming otherwise.
 */
describe('the switches that make silence deliberate', () => {
  it('applies every one of them', () => {
    const commandLine = recorder();
    applyPrivacySwitches(commandLine);
    expect(commandLine.applied).toHaveLength(PRIVACY_SWITCHES.length);
  });

  it.each([
    ['periodic requests Chromium makes on its own', 'disable-background-networking'],
    ['component updates announcing this install', 'disable-component-update'],
    ['reports describing where you went and what broke', 'disable-domain-reliability'],
    ['the invisible request a link can ask for', 'no-pings'],
  ])('turns off %s', (_reason, name) => {
    const commandLine = recorder();
    applyPrivacySwitches(commandLine);
    expect(commandLine.applied.map((entry) => entry.name)).toContain(name);
  });

  it.each([
    ['scanning your network for cast devices', 'MediaRouter'],
    ['fetching per-site hints keyed by where you go', 'OptimizationHints'],
    ['telling a server what a page says', 'Translate'],
    ['describing your forms to a server', 'AutofillServerCommunication'],
    ['the advertising measurement stack', 'PrivacySandboxAdsAPIs'],
    ['attribution reporting', 'AttributionReporting'],
    ['topics', 'TopicsAPI'],
  ])('disables the feature for %s', (_reason, feature) => {
    const commandLine = recorder();
    applyPrivacySwitches(commandLine);
    const features = commandLine.applied.find((entry) => entry.name === 'disable-features')?.value ?? '';
    expect(features.split(',')).toContain(feature);
  });

  // The reason is what makes this reviewable rather than a list of magic
  // strings nobody dares touch.
  it('says why each one is there', () => {
    for (const entry of PRIVACY_SWITCHES) {
      expect(entry.reason.length).toBeGreaterThan(30);
    }
  });
});
