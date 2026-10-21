// Libs
import { Menu, nativeImage, type MenuItemConstructorOptions } from 'electron';

// Utils
import { t } from '../../shared/i18n/translate';

// Types
import type { Browser } from '../app/browser';
import type { PopupAnchor } from '../extensions/action-popup';

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' };

const iconFrom = (dataUrl: string | null) =>
  dataUrl ? nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 }) : undefined;

/** Every extension that is on: its button, whether it is pinned, its options, and the way to manage them all. */
export function extensionsMenuItems(browser: Browser, anchor: PopupAnchor): MenuItemConstructorOptions[] {
  const { extensions } = browser.profile;
  const tabId = browser.activeChromeTabId();
  const enabled = extensions.summaries(tabId).filter((extension) => extension.isEnabled);
  const withButtons = enabled.flatMap((extension) =>
    extension.action ? [{ ...extension, action: extension.action }] : [],
  );
  const withOptions = enabled.filter((extension) => extension.hasOptionsPage);
  const buttons: MenuItemConstructorOptions[] =
    withButtons.length === 0
      ? []
      : [
          // An unpinned extension's popup opens under the extensions button, as in Chrome.
          ...withButtons.map((extension): MenuItemConstructorOptions => ({
            label: extension.name,
            icon: iconFrom(extension.action.iconDataUrl ?? extension.iconDataUrl),
            enabled: extension.action.isEnabled,
            click: () => extensions.press(extension.id, browser.window, tabId, anchor),
          })),
          SEPARATOR,
          {
            label: t('main.menu.extensions.pin'),
            submenu: withButtons.map((extension): MenuItemConstructorOptions => ({
              label: extension.name,
              type: 'checkbox',
              checked: extension.isPinned,
              click: () => extensions.setPinned(extension.id, !extension.isPinned),
            })),
          },
        ];
  const options: MenuItemConstructorOptions[] =
    withOptions.length === 0
      ? []
      : [
          {
            label: t('main.menu.extensions.options'),
            submenu: withOptions.map((extension): MenuItemConstructorOptions => ({
              label: extension.name,
              click: () => extensions.openOptions(extension.id),
            })),
          },
        ];
  return [
    ...buttons,
    ...options,
    ...(buttons.length + options.length > 0 ? [SEPARATOR] : []),
    { label: t('main.menu.extensions.manage'), click: () => browser.showPage('settings', 'extensions') },
  ];
}

export function showExtensionsMenu(browser: Browser, anchor: PopupAnchor): void {
  Menu.buildFromTemplate(extensionsMenuItems(browser, anchor)).popup({
    window: browser.window,
    x: anchor.left,
    y: anchor.bottom,
  });
}
