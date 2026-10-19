import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PrivacyPane } from '@/components/views/settings/privacy/PrivacyPane';

vi.mock('@/lib/bridge', async () => (await import('../bridge-mock')).fallbackBridge);

afterEach(cleanup);

describe('the privacy pane', () => {
  it('takes the tracker count from the blocker', () => {
    const info = { blockerRuleCount: 122, filterLists: [] } as unknown as Parameters<typeof PrivacyPane>[0]['info'];
    render(<PrivacyPane info={info} openPane={() => {}} />);
    expect(document.body.textContent).toContain('122 domains');
  });

  it('says secure connections fall back only after asking', () => {
    render(<PrivacyPane info={null} openPane={() => {}} />);
    expect(document.body.textContent).toContain('asks before falling back to HTTP');
  });
});
