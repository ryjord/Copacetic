import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
import { GeneralPane } from '@/components/views/settings/general/GeneralPane';

let settings = { ...DEFAULT_SETTINGS_SHAPE };
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown }) => unknown) => select({ settings }),
}));

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/views/settings/shared/options')>();
  return { ...actual, updateSettings: (patch: unknown) => updateSettings(patch) };
});

vi.mock('@/lib/bridge/bridge', async () => (await import('../bridge-mock')).fallbackBridge);

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS_SHAPE };
  updateSettings.mockClear();
});
afterEach(cleanup);

describe('what opens at startup', () => {
  it('reads last tabs from the reopen setting', () => {
    render(<GeneralPane />);
    expect(screen.getByRole('radio', { name: 'Last tabs' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens the start page when asked', () => {
    render(<GeneralPane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Start page', checked: false }));
    expect(updateSettings).toHaveBeenCalledWith({ restoreTabsOnLaunch: false, startupUrl: null });
  });

  // Choosing a page saves nothing until there is an address to open.
  it('asks for the page before saving it, and refuses what is not an address', () => {
    render(<GeneralPane />);
    fireEvent.click(screen.getAllByRole('radio', { name: 'A page' })[0]!);
    expect(updateSettings).not.toHaveBeenCalled();

    const field = screen.getByLabelText('Address of the page to open at startup');
    fireEvent.change(field, { target: { value: 'not an address' } });
    fireEvent.blur(field);
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/not a web address/)).toBeTruthy();

    fireEvent.change(field, { target: { value: 'example.com' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(updateSettings).toHaveBeenCalledWith({ restoreTabsOnLaunch: false, startupUrl: 'https://example.com/' });
  });
});

describe('how long history is kept', () => {
  it('shows ninety days unless changed', () => {
    render(<GeneralPane />);
    expect(screen.getByRole('combobox', { name: 'Keep history' }).textContent).toContain('For 90 days');
  });
});

describe('search engines someone adds', () => {
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('adds one with a keyword', () => {
    render(<GeneralPane />);
    fill('Name', 'Wikipedia');
    fill('Keyword', 'W');
    fill('Address, with %s for the search', 'https://en.wikipedia.org/w/index.php?search=%s');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const [patch] = updateSettings.mock.calls.at(-1) ?? [];
    expect(patch).toMatchObject({
      customSearchEngines: [{ name: 'Wikipedia', keyword: 'w', searchTemplate: expect.stringContaining('%s') }],
    });
  });

  it('says what is wrong rather than adding an address with nowhere for the search', () => {
    render(<GeneralPane />);
    fill('Name', 'Maps');
    fill('Keyword', 'm');
    fill('Address, with %s for the search', 'https://maps.example/');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/with %s in it/)).toBeTruthy();
  });

  // Removing the default leaves searching somewhere real.
  it('puts the default back when the chosen engine is removed', () => {
    const wikipedia = {
      id: 'custom-wikipedia1',
      name: 'Wikipedia',
      keyword: 'w',
      searchTemplate: 'https://en.wikipedia.org/w/index.php?search=%s',
    } as const;
    settings = { ...DEFAULT_SETTINGS_SHAPE, searchEngine: wikipedia.id, customSearchEngines: [wikipedia] };
    render(<GeneralPane />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Wikipedia' }));
    expect(updateSettings).toHaveBeenCalledWith({ customSearchEngines: [], searchEngine: 'brave' });
  });
});
