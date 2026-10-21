import { describe, expect, it, vi } from 'vitest';

type Template = Record<string, unknown>[];

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
  nativeImage: { createFromDataURL: () => ({ resize: () => 'icon' }) },
}));

const { extensionsMenuItems } = await import('../../../../electron/main/menus/extensions-menu');

const ANCHOR = { left: 10, right: 38, bottom: 40 };
const action = {
  title: 'Block',
  iconDataUrl: null,
  badgeText: '',
  badgeColour: '#000',
  hasPopup: true,
  isEnabled: true,
};
const summary = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  isEnabled: true,
  isPinned: true,
  hasOptionsPage: false,
  iconDataUrl: null,
  action,
  ...over,
});

function menuFor(summaries: ReturnType<typeof summary>[]) {
  const extensions = { summaries: () => summaries, press: vi.fn(), setPinned: vi.fn(), openOptions: vi.fn() };
  const showPage = vi.fn();
  const browser = { profile: { extensions }, activeChromeTabId: () => 7, window: 'window', showPage } as never;
  // Read as plain records, the way the other menu tests read a captured template.
  const items: Template = extensionsMenuItems(browser, ANCHOR).map((item) =>
    Object.fromEntries(Object.entries(item)),
  );
  const labelled = (label: string) => items.find((item) => item.label === label);
  const click = (item: Record<string, unknown> | undefined) => (item?.click as () => void)();
  return { items, labelled, click, extensions, showPage };
}

describe('the extensions menu', () => {
  // An unpinned extension is reached here, and its popup opens under the extensions button.
  it('opens an extension’s button, pinned or not, under the extensions button', () => {
    const { labelled, click, extensions } = menuFor([summary('Blocker', { isPinned: false })]);
    click(labelled('Blocker'));
    expect(extensions.press).toHaveBeenCalledWith('Blocker', 'window', 7, ANCHOR);
  });

  it('pins and unpins from the toolbar', () => {
    const { labelled, extensions } = menuFor([summary('Pinned'), summary('Loose', { isPinned: false })]);
    const submenu = labelled('Pin to toolbar')?.submenu as Template;
    expect(submenu.map((item) => item.checked)).toEqual([true, false]);
    (submenu[1]?.click as () => void)();
    expect(extensions.setPinned).toHaveBeenCalledWith('Loose', true);
  });

  it('leaves out what is off, and offers options only where there are some', () => {
    const { items, labelled } = menuFor([
      summary('Off', { isEnabled: false }),
      summary('Quiet', { action: null, hasOptionsPage: true }),
    ]);
    expect(items.some((item) => item.label === 'Off')).toBe(false);
    expect(labelled('Pin to toolbar')).toBeUndefined();
    expect((labelled('Options')?.submenu as Template).map((item) => item.label)).toEqual(['Quiet']);
  });

  it('always ends with the way to manage them', () => {
    const { items, click, showPage } = menuFor([]);
    expect(items).toHaveLength(1);
    click(items[0]);
    expect(showPage).toHaveBeenCalledWith('settings', 'extensions');
  });
});
