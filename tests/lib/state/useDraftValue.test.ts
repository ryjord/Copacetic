import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useDraftValue } from '@/lib/state/useDraftValue';

describe('useDraftValue', () => {
  // Once saved, the draft is spent: a value that returns to where it began is that value, not the old draft.
  it('shows the draft until the saved value moves, and does not bring it back when the value returns to where it began', () => {
    const { result, rerender } = renderHook(({ saved }) => useDraftValue(saved), { initialProps: { saved: 3 } });
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    rerender({ saved: 5 });
    rerender({ saved: 3 });
    expect(result.current[0]).toBe(3);
  });
});
