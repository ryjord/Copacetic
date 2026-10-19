import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Switch } from '../../../../src/components/ui/Switch/Switch';

afterEach(cleanup);

describe('a switch', () => {
  it('is named once, says whether it is on, and turns over when pressed', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Block trackers" />);
    const control = screen.getByRole('switch', { name: 'Block trackers' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
