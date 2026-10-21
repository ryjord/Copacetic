// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Components
import { ConnectionBadge } from '@/components/shell/ConnectionBadge/ConnectionBadge';

// Types
import type { TabState } from '../../../../electron/shared/types';

vi.mock('@/lib/bridge/bridge', () => ({ send: vi.fn() }));
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { siteInfo: null }) => unknown) => select({ siteInfo: null }),
}));

afterEach(cleanup);

// Only what the badge reads.
const tab = (blockedCount: number, level: 'secure' | 'insecure' = 'secure') =>
  ({ id: 'a', internalPage: null, blockedCount, security: { level } }) as TabState;

describe('the connection badge', () => {
  it('says how many trackers it blocked, as well as how the page arrived', () => {
    render(<ConnectionBadge tab={tab(14)} />);
    const badge = screen.getByRole('button', { name: /14 trackers blocked/ });
    expect(badge.textContent).toContain('14 blocked');
  });

  it('says nothing of trackers on a page where none were blocked', () => {
    render(<ConnectionBadge tab={tab(0)} />);
    expect(screen.getByRole('button').textContent).not.toContain('blocked');
  });

  it('counts what was blocked on an unencrypted page too', () => {
    render(<ConnectionBadge tab={tab(3, 'insecure')} />);
    expect(screen.getByRole('button').textContent).toMatch(/blocked/);
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/3 trackers blocked/);
  });
});
