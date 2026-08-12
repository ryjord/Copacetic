import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { AboutPane } from '../src/components/surfaces/settings/AboutPane';
import { PrivacyPane } from '../src/components/surfaces/settings/PrivacyPane';

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

  // A number typed into the prose is one nobody updates when the list changes.
  it('hardcodes no domain count in any pane', () => {
    for (const file of ['AboutPane.tsx', 'PrivacyPane.tsx']) {
      const source = readFileSync(`src/components/surfaces/settings/${file}`, 'utf8');
      expect(source).not.toMatch(/\b\d{2,4} domains\b/);
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

  it('does not claim a password manager before there is one', () => {
    render(<AboutPane info={info} />);
    expect(screen.getByText('Does it remember passwords?')).toBeTruthy();
    expect(document.body.textContent).toContain('There is no password manager yet');
  });
});
