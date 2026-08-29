import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

/**
 * The preload is loaded from a path that differs between a built tree and a
 * packaged one. When it is wrong the entire chrome is inert while every unit
 * test still passes, because the path is a string and type-checking cannot know
 * what is at the end of it. This has broken before.
 */
describe('the bridge between the chrome and the main process', () => {
  it('installs the API the chrome is written against', async () => {
    expect(await copacetic.chrome.evaluate(() => typeof window.copacetic)).toBe('object');
  });

  it('exposes every section the chrome uses', async () => {
    const sections = await copacetic.chrome.evaluate(() => Object.keys(window.copacetic).sort());
    expect(sections).toEqual(
      [
        'app',
        'auth',
        'bookmarkFolders',
        'bookmarks',
        'chrome',
        'connections',
        'data',
        'downloads',
        'find',
        'groups',
        'history',
        'omnibox',
        'on',
        'permissions',
        'settings',
        'tabs',
        'updates',
        'vault',
        'wallpaper',
        'window',
      ].sort(),
    );
  });

  it('answers a real call over IPC', async () => {
    const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    expect(Array.isArray(state.tabs)).toBe(true);
  });

  it('carries a change back: opening a tab shows up in the next state', async () => {
    const before = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    const after = await copacetic.chrome.evaluate(async () => {
      await window.copacetic.tabs.create('about:blank');
      return window.copacetic.chrome.getState();
    });
    expect(after.tabs.length).toBe(before.tabs.length + 1);
  });

  it('pushes state to the chrome without being asked', async () => {
    const pushed = await copacetic.chrome.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const stop = window.copacetic.on.state(() => {
            stop();
            resolve(true);
          });
          void window.copacetic.tabs.create('about:blank');
          setTimeout(() => resolve(false), 5000);
        }),
    );
    expect(pushed).toBe(true);
  });
});
