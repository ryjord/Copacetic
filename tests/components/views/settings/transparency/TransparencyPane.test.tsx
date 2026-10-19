import { afterEach, describe, expect, it, vi } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { TransparencyPane } from '@/components/views/settings/transparency/TransparencyPane';

vi.mock('@/lib/bridge', async () => (await import('../bridge-mock')).fallbackBridge);

afterEach(cleanup);

const info = {
  version: '2.0.0',
  electronVersion: '43.4.1',
  chromeVersion: '150.0.0.0',
  platform: 'darwin',
  blockerRuleCount: 122,
  filterLists: [],
} as unknown as Parameters<typeof TransparencyPane>[0]['info'];

/**
 * This page is where Copacetic makes claims about itself, and a claim that
 * drifts from the code is worse than none. Counts are read, never written out,
 * and the disclaimers cannot be dropped in a redesign without this failing.
 */
describe('what Copacetic says about itself', () => {
  it('takes the tracker count from the blocker', () => {
    render(<TransparencyPane info={info} />);
    expect(document.body.textContent).toContain('122 domains');
  });

  it('says something true before the count has arrived', () => {
    render(<TransparencyPane info={null} />);
    expect(document.body.textContent).toContain('a list of domains');
    expect(document.body.textContent).not.toMatch(/\d+ domains/);
  });

  it.each([
    'It has not been security audited.',
    'The builds are not code-signed.',
    'no analytics, no telemetry, no crash reporting and no account',
    'Fill password',
    'never offers to save what you type',
    'window.chrome',
  ])('still says %o', (claim) => {
    render(<TransparencyPane info={info} />);
    expect(document.body.textContent).toContain(claim);
  });

  // Globbed so a pane added later is covered without anyone remembering.
  it('hardcodes no domain count in any settings file', () => {
    const files = globSync('src/components/views/settings/**/*.tsx');
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\b\d{2,4} domains\b/);
    }
  });

  // The house rule for anything that ships: no em dashes in what people read.
  it('uses no em dashes anywhere in Settings', () => {
    for (const file of globSync('src/components/views/settings/**/*.tsx')) {
      expect(readFileSync(file, 'utf8')).not.toContain('—');
    }
  });
});

describe('what filling claims is what ships', () => {
  it('describes a control that exists', () => {
    expect(readFileSync('electron/main/menus/context-menu.ts', 'utf8')).toContain("label: 'Fill password'");
    expect(readFileSync('electron/main/workflows/password-fill.ts', 'utf8')).toContain('fillScriptFor(');
  });
});
