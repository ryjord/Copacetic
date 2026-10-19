import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { Browser } from '../app/browser';

/** Every profile, each opening a window of its own, and the way to manage them. */
export function profileMenuItems(browser: Browser): MenuItemConstructorOptions[] {
  return [
    ...browser.profile.allProfiles().map((summary): MenuItemConstructorOptions => ({
      label: summary.id === browser.profile.id ? `${summary.name} (this window)` : summary.name,
      click: () => void browser.profile.openWindowIn(summary.id),
    })),
    { type: 'separator' },
    { label: 'Manage profiles…', click: () => browser.openSurface('settings') },
  ];
}

export function showProfileMenu(browser: Browser, x: number, y: number): void {
  Menu.buildFromTemplate(profileMenuItems(browser)).popup({ window: browser.window, x, y });
}
