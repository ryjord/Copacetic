import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { RangeSlider } from '@/components/ui/RangeSlider/RangeSlider';

afterEach(cleanup);

// As Settings uses it: the shown value follows the input while the saved one waits for onChange.
function Previewed({ onChange }: { onChange: (value: number) => void }) {
  const [shown, setShown] = useState(40);
  return <RangeSlider value={shown} min={0} max={100} label="Dim" onInput={setShown} onChange={onChange} />;
}

function slider() {
  const onChange = vi.fn();
  render(<Previewed onChange={onChange} />);
  return { onChange, input: screen.getByRole('slider', { name: 'Dim' }) };
}

describe('RangeSlider', () => {
  it('saves on a key that moves it, not on Tab', () => {
    const { onChange, input } = slider();
    fireEvent.keyUp(input, { key: 'Tab' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyUp(input, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('saves a change made without a key or a pointer once focus leaves', () => {
    const { onChange, input } = slider();
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '55' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(55);
  });
});
