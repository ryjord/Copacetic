// Libs
import { BrowserWindow, type WebContents, app, session as electronSession } from 'electron';
import { rmSync } from 'node:fs';
import path from 'node:path';

// Utils
import { hostResolverFor } from '../../shared/dns';
import { FIRST_PROFILE_ID } from '../../shared/partitions';
import { profileDirectory, sweepRemovedProfiles } from '../data/profile-folders';
import { ProfilesStore } from '../data/profiles-store';
import { ContentBlocker } from '../security/blocker';
import { hardenChromeSession } from '../security/security';
import { describeError, log } from '../system/diagnostics';
import { UpdateManager } from '../system/updates';
import { applyAppearance, onAppearanceChange } from '../window/appearance';
import { filtersRoot } from './env';
import { Profile, type ProfileHost } from './profile';

// Types
import type { AppWideSetting, ProfileSummary } from '../../shared/profiles';
import type { ShortcutOverrides } from '../../shared/shortcuts';
import type { GroupColourId } from '../../shared/tab-groups';
import type { Settings } from '../../shared/types';
import type { Browser } from './browser';

/**
 * Every profile, and the things the app has only one of.
 *
 * A profile is opened the first time a window of it is, and stays open for the
 * rest of the run, as the first one always has: its downloads and its sessions
 * outlive any window.
 */
export class Profiles {
  readonly blocker = new ContentBlocker();
  readonly updates: UpdateManager;
  private readonly list = new ProfilesStore();
  private readonly open = new Map<string, Profile>();
  private readonly host: ProfileHost;
  private readonly stopWatchingAppearance: () => void;
  private isQuitting = false;
  /** Told when a profile is added, renamed or removed, so the application menu can be built again. */
  private onListChanged: () => void = () => {};
  private onShortcutsChanged: () => void = () => {};
  private isRecording = false;

  constructor() {
    const appData = app.getPath('userData');
    sweepRemovedProfiles(
      appData,
      this.list.list().map((profile) => profile.id),
    );
    hardenChromeSession(electronSession.defaultSession);
    // A list fetched on request is preferred to the one that shipped, and the shipped one is the floor.
    if (!this.blocker.loadShippedLists(path.join(appData, 'filters'))) {
      this.blocker.loadShippedLists(filtersRoot());
    }
    this.updates = new UpdateManager(() => this.scheduleStatePush());
    this.host = {
      blocker: this.blocker,
      updates: this.updates,
      appSettings: () => {
        const settings = this.first.store.getSettings();
        return {
          appearance: settings.appearance,
          dnsMode: settings.dnsMode,
          dnsResolverId: settings.dnsResolverId,
          checkForUpdates: settings.checkForUpdates,
          shortcutOverrides: settings.shortcutOverrides,
        };
      },
      updateAppSettings: (patch) => this.updateAppSettings(patch),
      windowsChanged: () => this.rememberWhatIsOpen(),
      summaries: () => this.summaries(),
      openWindowIn: async (profileId) => {
        if (this.list.find(profileId)) {
          await this.openWindow(profileId);
        }
      },
    };
    // Before any window exists, so each is created in the colour it will be painted.
    applyAppearance(this.first.store.getSettings().appearance);
    this.stopWatchingAppearance = onAppearanceChange(() => this.allWindows().forEach((window) => window.repaint()));
  }

  /** The profile everything from before profiles is in, and the one that can never be removed. */
  get first(): Profile {
    return this.profile(FIRST_PROFILE_ID);
  }

  /** Opens a profile the first time it is asked for. Only one the list holds can be opened at all. */
  profile(id: string): Profile {
    const existing = this.open.get(id);
    if (existing) {
      return existing;
    }
    if (!this.list.find(id)) {
      throw new Error(`There is no profile ${id}`);
    }
    const opened = new Profile(id, profileDirectory(app.getPath('userData'), id), this.host);
    this.open.set(id, opened);
    return opened;
  }

  /** The menu binds the keys, so it is built again when one moves. */
  whenShortcutsChange(listener: () => void): void {
    this.onShortcutsChanged = listener;
  }

  shortcutOverrides(): ShortcutOverrides {
    return this.first.store.getSettings().shortcutOverrides;
  }

  isRecordingShortcut(): boolean {
    return this.isRecording;
  }

  setRecordingShortcut(isRecording: boolean): void {
    if (this.isRecording !== isRecording) {
      this.isRecording = isRecording;
      this.onShortcutsChanged();
    }
  }

  whenListChanges(listener: () => void): void {
    this.onListChanged = listener;
  }

  summaries(): ProfileSummary[] {
    return this.list.list();
  }

  summaryOf(id: string): ProfileSummary | null {
    return this.list.find(id);
  }

  /** Applied before the first page, so nothing is looked up the plaintext way first. */
  start(): void {
    const settings = this.first.store.getSettings();
    app.configureHostResolver(hostResolverFor(settings.dnsMode, settings.dnsResolverId));
    this.updates.start(settings.checkForUpdates);
  }

  /** The profiles open at the last quit, each with its own windows, or the first profile alone. */
  async restoreWindows(didLastRunEndBadly: boolean): Promise<void> {
    const ids = this.list.openAtQuit();
    for (const id of ids.length > 0 ? ids : [FIRST_PROFILE_ID]) {
      await this.profile(id).restoreWindows(didLastRunEndBadly);
    }
  }

  async openWindow(profileId: string): Promise<Browser> {
    return this.profile(profileId).openWindow();
  }

  /** The window in front, whichever profile it is in, or the one that was last. */
  focused(): Browser | null {
    const inFront = BrowserWindow.getFocusedWindow();
    const match = this.allWindows().find((window) => window.window === inFront);
    if (match) {
      return match;
    }
    const lastUsed = [...this.open.values()]
      .filter((profile) => profile.allWindows().length > 0)
      .sort((aProfile, bProfile) => bProfile.lastInFrontAt() - aProfile.lastInFrontAt())[0];
    return lastUsed?.focused() ?? null;
  }

  /** For a menu item with no window to act on: the first profile's, which is what a launch would open. */
  async focusedOrNew(): Promise<Browser> {
    return this.focused() ?? this.first.openWindow();
  }

  browserFor(contents: WebContents): Browser | null {
    return this.allWindows().find((window) => window.owns(contents)) ?? null;
  }

  allWindows(): Browser[] {
    return [...this.open.values()].flatMap((profile) => profile.allWindows());
  }

  scheduleStatePush(): void {
    this.open.forEach((profile) => profile.scheduleStatePush());
  }

  // -------------------------------------------------------------- managing

  create(name: string, colour: GroupColourId): ProfileSummary {
    const created = this.list.add(name, colour);
    this.listChanged();
    return created;
  }

  update(id: string, changes: { name?: string; colour?: GroupColourId }): void {
    this.list.update(id, changes);
    this.listChanged();
  }

  /**
   * Removes a profile and everything it kept. Its windows close first; its
   * sessions are emptied now and their folders deleted at the next launch,
   * once Chromium has let go of them.
   */
  async remove(id: string): Promise<boolean> {
    if (id === FIRST_PROFILE_ID || !this.list.find(id)) {
      return false;
    }
    const removing = this.open.get(id);
    if (removing) {
      removing.allWindows().forEach((window) => window.window.destroy());
      await Promise.all(removing.sessions.siteDataSessions().map((session) => removing.sessions.clear(session)));
      removing.dispose();
      this.open.delete(id);
      try {
        rmSync(removing.directory, { recursive: true, force: true });
      } catch (error) {
        log.warn('could not remove a profile folder yet', describeError(error));
      }
    }
    this.list.remove(id);
    this.listChanged();
    return true;
  }

  private listChanged(): void {
    this.onListChanged();
    this.scheduleStatePush();
  }

  // -------------------------------------------------------------- settings

  /** Kept with the first profile's settings, and applied to the whole app. */
  private updateAppSettings(patch: Partial<Pick<Settings, AppWideSetting>>): void {
    const changes: Partial<Settings> = {
      ...(patch.appearance === undefined ? {} : { appearance: patch.appearance }),
      ...(patch.dnsMode === undefined ? {} : { dnsMode: patch.dnsMode }),
      ...(patch.dnsResolverId === undefined ? {} : { dnsResolverId: patch.dnsResolverId }),
      ...(patch.checkForUpdates === undefined ? {} : { checkForUpdates: patch.checkForUpdates }),
      ...(patch.shortcutOverrides === undefined ? {} : { shortcutOverrides: patch.shortcutOverrides }),
    };
    if (Object.keys(changes).length === 0) {
      return;
    }
    const next = this.first.store.updateSettings(changes);
    if (changes.appearance !== undefined) {
      applyAppearance(next.appearance);
    }
    if (changes.dnsMode !== undefined || changes.dnsResolverId !== undefined) {
      app.configureHostResolver(hostResolverFor(next.dnsMode, next.dnsResolverId));
    }
    if (changes.checkForUpdates !== undefined) {
      this.updates.start(next.checkForUpdates);
    }
    if (changes.shortcutOverrides !== undefined) {
      this.onShortcutsChanged();
    }
    this.scheduleStatePush();
  }

  /** Kept as it changes, so a launch after every window was closed reopens the profile last used. */
  private rememberWhatIsOpen(): void {
    // Quitting closes the windows one by one; what was open is what was open before the first went.
    if (this.isQuitting) {
      return;
    }
    const withWindows = [...this.open.values()].filter((profile) => profile.allWindows().length > 0);
    if (withWindows.length > 0) {
      this.list.setOpenAtQuit(withWindows.map((profile) => profile.id));
    }
  }

  // ------------------------------------------------------------------ quit

  prepareForQuit(): void {
    this.isQuitting = true;
    this.open.forEach((profile) => profile.prepareForQuit());
    this.list.flush();
  }

  dispose(): void {
    this.prepareForQuit();
    this.updates.stop();
    this.stopWatchingAppearance();
  }
}
