import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { Browser } from '../app/browser';
import { t } from '../../shared/i18n/translate';

/** Every profile, each opening a window of its own, and the way to manage them. */
export function profileMenuItems(browser: Browser): MenuItemConstructorOptions[] {
  return [
    ...browser.profile.allProfiles().map((summary): MenuItemConstructorOptions => ({
      label:
        summary.id === browser.profile.id ? t('main.menu.profiles.thisWindow', { name: summary.name }) : summary.name,
      click: () => void browser.profile.openWindowIn(summary.id),
    })),
    { type: 'separator' },
    { label: t('main.menu.profiles.manage'), click: () => browser.showPage('settings', 'profiles') },
  ];
}

export function showProfileMenu(browser: Browser, x: number, y: number): void {
  Menu.buildFromTemplate(profileMenuItems(browser)).popup({ window: browser.window, x, y });
}
