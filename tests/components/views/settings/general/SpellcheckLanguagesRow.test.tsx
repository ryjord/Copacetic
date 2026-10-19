import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SpellcheckChoices } from '@shared/chrome/spellcheck';

let choices: SpellcheckChoices = { canChoose: true, available: [], inUse: [] };
vi.mock('@/lib/bridge/bridge', () => ({
  ask: async () => choices,
}));
vi.mock('@/components/views/settings/shared/options', () => ({ updateSettings: vi.fn() }));

const { SpellcheckLanguagesRow, languagesAfterChoosing } =
  await import('@/components/views/settings/general/SpellcheckLanguagesRow');

afterEach(cleanup);

describe('the spelling languages row', () => {
  it('says macOS chooses, rather than offering a picker that would do nothing', async () => {
    choices = { canChoose: false, available: [], inUse: ['en-GB'] };
    render(<SpellcheckLanguagesRow chosen={[]} />);
    expect(
      await screen.findByText('macOS checks spelling in the languages set in System Settings, now British English.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Spelling language')).toBeNull();
  });

  it('offers a choice elsewhere, and says where dictionaries come from', async () => {
    choices = { canChoose: true, available: ['en-GB', 'fr'], inUse: ['en-GB'] };
    render(<SpellcheckLanguagesRow chosen={[]} />);
    expect(
      await screen.findByText(
        'Checking in British English. A dictionary is downloaded from Google the first time a language is used.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Spelling language')).toBeTruthy();
    expect(screen.queryByLabelText('Second spelling language')).toBeNull();
  });

  it('offers a second language once a first is chosen', async () => {
    choices = { canChoose: true, available: ['en-GB', 'fr'], inUse: ['fr'] };
    render(<SpellcheckLanguagesRow chosen={['fr']} />);
    expect(await screen.findByLabelText('Second spelling language')).toBeTruthy();
  });

  it('keeps the second language when the first changes, unless they collide', () => {
    expect(languagesAfterChoosing('fr', 'de')).toEqual(['fr', 'de']);
    expect(languagesAfterChoosing('de', 'de')).toEqual(['de']);
    expect(languagesAfterChoosing('fr', undefined)).toEqual(['fr']);
    expect(languagesAfterChoosing('system', 'de')).toEqual([]);
  });
});
