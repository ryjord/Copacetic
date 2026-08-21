import { afterEach, describe, expect, it, vi } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { AboutPane } from '../src/components/settings/about/AboutPane';
import { PrivacyPane } from '../src/components/settings/privacy/PrivacyPane';

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

  // This answer was "there is no password manager yet" until 1.3.0, and the
  // test failed the moment that stopped being true — which is what it was for.
  // It now holds the narrower claim, which will go the same way when filling
  // arrives.
  it('claims only what the vault actually does', () => {
    render(<AboutPane info={info} />);
    expect(screen.getByText('Does it remember passwords?')).toBeTruthy();
    expect(document.body.textContent).toContain('does not yet offer to save what you type or fill anything in');
  });
});
