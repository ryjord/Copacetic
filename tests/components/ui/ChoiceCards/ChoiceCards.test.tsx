import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChoiceCards } from '@/components/ui/ChoiceCards/ChoiceCards';

afterEach(cleanup);

const options = [
  { id: 'light', label: 'Light', preview: null },
  { id: 'photo', label: 'Photo', preview: null },
] as const;

function arrowFromLight(isChosenByArrowKeys: boolean) {
  const onChange = vi.fn();
  render(
    <ChoiceCards
      label="Background"
      options={options}
      value="light"
      onChange={onChange}
      isChosenByArrowKeys={isChosenByArrowKeys}
    />,
  );
  const light = screen.getByRole('radio', { name: 'Light' });
  light.focus();
  fireEvent.keyDown(light, { key: 'ArrowRight' });
  return onChange;
}

describe('ChoiceCards and the arrow keys', () => {
  it('chooses as the arrows move, as a radio group does', async () => {
    const onChange = arrowFromLight(true);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('photo'));
  });

  it('only moves when choosing does more than show a choice', async () => {
    const onChange = arrowFromLight(false);
    const photo = screen.getByRole('radio', { name: 'Photo' });
    await waitFor(() => expect(document.activeElement).toBe(photo));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(photo);
    expect(onChange).toHaveBeenCalledWith('photo');
  });
});
