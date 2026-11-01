import { type MenuEntry, popupMenu } from '../engine/menus';
import { t } from '../../shared/i18n/translate';
import type { Browser } from '../app/browser';

/** Every profile, each opening a window of its own, and the way to manage them. */
export function profileMenuItems(browser: Browser): MenuEntry[] {
  return [
    ...browser.profile.allProfiles().map((summary): MenuEntry => ({
      label:
        summary.id === browser.profile.id ? t('main.menu.profiles.thisWindow', { name: summary.name }) : summary.name,
      click: () => void browser.profile.openWindowIn(summary.id),
    })),
    { type: 'separator' },
    { label: t('main.menu.profiles.manage'), click: () => browser.showPage('settings', 'profiles') },
  ];
}

export function showProfileMenu(browser: Browser, x: number, y: number): void {
  popupMenu(profileMenuItems(browser), { window: browser.window, x, y });
}
