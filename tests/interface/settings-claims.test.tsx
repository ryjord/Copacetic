import { afterEach, describe, expect, it, vi } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { AboutPane } from '../../src/components/settings/about/AboutPane';
import { PasswordsPane } from '../../src/components/settings/passwords/PasswordsPane';
import { PrivacyPane } from '../../src/components/settings/privacy/PrivacyPane';

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(cleanup);

const info = {
  version: '1.2.13',
  electronVersion: '43.3.0',
  chromeVersion: '150.0.0.0',
  platform: 'darwin',
  blockerRuleCount: 122,
} as Parameters<typeof AboutPane>[0]['info'];

/**
 * Settings is where Copacetic makes claims about itself, and a claim that
 * drifts from what the code does is worse than no claim. These numbers are
 * counted, never written out.
 */
describe('the counts Settings quotes', () => {
  it('takes the tracker count from the blocker, in About', () => {
    render(<AboutPane info={info} />);
    expect(document.body.textContent).toContain('122 domains');
  });

  it('takes the same count in Privacy', () => {
    render(<PrivacyPane info={info} />);
    expect(document.body.textContent).toContain('122 domains');
  });

  it('says something honest before the count has arrived', () => {
    render(<AboutPane info={null} />);
    expect(document.body.textContent).toContain('a list of domains');
    expect(document.body.textContent).not.toMatch(/\d+ domains/);
  });

  // Globbed rather than listed: a pane added later is covered without anyone
  // remembering, and moving the folder does not silently stop the check.
  it('hardcodes no domain count in any pane', () => {
    const panes = globSync('src/components/settings/**/*Pane.tsx');
    expect(panes.length).toBeGreaterThan(4);
    for (const file of panes) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\b\d{2,4} domains\b/);
    }
  });
});

describe('the disclaimers stay put', () => {
  it.each([
    'It has not been security audited.',
    'The builds are not code-signed.',
    'no analytics, no telemetry, no crash reporting and no account',
  ])('still says %o', (claim) => {
    render(<AboutPane info={info} />);
    expect(document.body.textContent).toContain(claim);
  });

  /*
   * This answer was "there is no password manager yet" until 1.3.0, and the
   * test failed the moment that stopped being true — which is what it was for.
   * It was then rewritten to pin "does not yet offer to save what you type or
   * fill anything in", with a note saying it would go the same way when filling
   * arrived. Filling arrived in 1.3.2. Nobody came back, and for four releases
   * a passing test held a false sentence in place.
   *
   * So this no longer pins a sentence. It checks the half that is still true
   * and leaves the half that changes to the tests below, which read the code.
   */
  it('claims only what the vault actually does', () => {
    render(<AboutPane info={info} />);
    expect(screen.getByText('Does it remember passwords?')).toBeTruthy();
    expect(document.body.textContent).toContain('never offers to save what you type');
  });
});

/**
 * Filling passwords shipped in 1.3.2, and for four releases Settings and About
 * went on saying it did not exist — "Copacetic does not fill them in yet", and,
 * asked directly, "No, and it will not". Honesty is the thing this browser is
 * staked on, and that was the sharpest possible violation of it: the flagship
 * honesty surface denying a feature the flagship honesty surface links to.
 *
 * So the claim is tied to the code here rather than left to be re-read. If
 * filling stops shipping, this fails and the copy is rewritten deliberately.
 */
describe('what Settings says about filling passwords', () => {
  const contextMenu = readFileSync('electron/main/menus/context-menu.ts', 'utf8');
  const browserSource = readFileSync('electron/main/app/browser.ts', 'utf8');

  it('is describing something that actually ships', () => {
    expect(contextMenu).toContain("label: 'Fill password'");
    expect(browserSource).toContain('fillScriptFor(');
  });

  it.each([
    ['Passwords', () => render(<PasswordsPane />)],
    ['About', () => render(<AboutPane info={info} />)],
  ])('%s names the control that does it', (_pane, show) => {
    show();
    expect(document.body.textContent).toContain('Fill password');
  });

  // The exact sentences that shipped, named so they cannot come back by
  // someone restoring an old paragraph.
  it.each([
    ['Passwords', () => render(<PasswordsPane />)],
    ['About', () => render(<AboutPane info={info} />)],
  ])('%s no longer denies that filling happens', (_pane, show) => {
    show();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('does not fill them in');
    expect(text).not.toContain('No, and it will not');
    expect(text).not.toContain('fill anything in');
  });

  /*
   * The counterweight, and the reason this is not simply "delete the denial".
   * Half the old claim was true: nothing watches what you type, because that
   * would need Copacetic's code in every page permanently, and save-on-submit
   * was built and dropped to keep that guarantee. Over-correcting into "it
   * manages your passwords" would be the same failure pointing the other way.
   */
  it('still says it never offers to save what you type', () => {
    render(<PasswordsPane />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('never offers to save what you type');
  });
});
