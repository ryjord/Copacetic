import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageShell } from '@/components/shell/PageShell/PageShell';

afterEach(cleanup);

describe('the frame of a page in a tab', () => {
  it('is a region named for the page, headed by its title, with its actions', () => {
    render(
      <PageShell title="History" actions={<button type="button">Clear</button>}>
        <p>entries</p>
      </PageShell>,
    );
    const region = screen.getByRole('region', { name: 'History' });
    expect(region.querySelector('h1')?.textContent).toBe('History');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
    expect(screen.getByText('entries')).toBeTruthy();
  });

  // Closing it is closing the tab, so a close button of its own would be a second way to do one thing.
  it('has no close button of its own', () => {
    render(<PageShell title="Settings">content</PageShell>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
