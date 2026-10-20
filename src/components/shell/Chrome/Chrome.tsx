'use client';

// Libs
import { useEffect, useLayoutEffect, useRef } from 'react';

// Components
import { BookmarksSurface } from '@/components/views/bookmarks/BookmarksSurface';
import { CommandPalette } from '@/components/views/palette/CommandPalette';
import { DownloadsSurface } from '@/components/views/downloads/DownloadsSurface';
import { HistorySurface } from '@/components/views/history/HistorySurface';
import { ReaderSurface } from '@/components/views/reader/ReaderSurface';
import { SettingsSurface } from '@/components/views/settings/SettingsSurface';
import { ErrorPage } from '@/components/views/error/ErrorPage';
import { StartPage } from '@/components/views/start/StartPage';
import { BookmarksBar } from '@/components/shell/BookmarksBar/BookmarksBar';
import { LiveAnnouncer } from '@/components/shell/LiveAnnouncer/LiveAnnouncer';
import { SplitView } from '@/components/shell/SplitView/SplitView';
import { TabStrip } from '@/components/shell/TabStrip/TabStrip';
import { Toolbar } from '@/components/shell/Toolbar/Toolbar';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { getBridge, isRunningInShell, send } from '@/lib/bridge/bridge';
import { isMacPlatform } from '@/lib/platform';
import { useInterfaceTokens } from '@/lib/state/useInterfaceTokens';
import { ambientLightStopsFor, ambientStopsFor } from '@shared/chrome/ambient';
import { t } from '@shared/i18n/translate';
import { reachedForAnotherTab } from '@shared/tabs/surfaces';
import { shownSplit } from '@shared/tabs/split-view';

/** The browser shell. */
export function Chrome() {
  const applyState = useBrowserStore((state) => state.applyState);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const openSettings = useBrowserStore((state) => state.openSettings);
  const requestOmniboxFocus = useBrowserStore((state) => state.requestOmniboxFocus);

  const isReady = useBrowserStore((state) => state.isReady);
  const surface = useBrowserStore((state) => state.surface);
  const theme = useBrowserStore((state) => state.settings.theme);
  const tabs = useBrowserStore((state) => state.orderedTabs);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const split = useBrowserStore((state) => shownSplit(state.split, state.activeTabId));

  const groups = useBrowserStore((state) => state.groups);
  const ambientHue = useBrowserStore((state) => state.settings.ambientHue);
  const showBookmarksBar = useBrowserStore((state) => state.settings.showBookmarksBar);

  const contentRef = useRef<HTMLDivElement>(null);

  // --- wiring to the main process -----------------------------------------

  useEffect(() => {
    const api = getBridge();
    if (!api) {
      return;
    }

    void api.chrome.getState().then(applyState);

    const unsubscribers = [
      api.on.state(applyState),
      api.on.focusOmnibox(requestOmniboxFocus),
      api.on.openSurface((next) => setSurface(next)),
      api.on.openSettingsPane((paneId) => openSettings(paneId)),
    ];

    // Anything asked for before this listener existed was pushed to nobody. The
    // main process holds the last one; collecting it here is what makes Cmd+,
    // during the second and a half this page takes to hydrate do something.
    void api.chrome.pendingSurface().then((pending) => {
      if (pending) {
        setSurface(pending);
      }
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [applyState, requestOmniboxFocus, setSurface, openSettings]);

  // --- reporting the content rectangle ------------------------------------

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element || !isRunningInShell()) {
      return;
    }

    let frame = 0;
    let last = '';

    const report = () => {
      const rect = element.getBoundingClientRect();
      const insets = {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(window.innerWidth - rect.right),
        bottom: Math.round(window.innerHeight - rect.bottom),
      };
      const signature = `${insets.top}|${insets.left}|${insets.right}|${insets.bottom}`;
      if (signature === last) {
        return;
      }
      last = signature;
      send((api) => api.chrome.setContentInsets(insets));
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(report);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
    // The chrome's height changes when these appear, and each change moves the
    // content rectangle the main process needs to match.
  }, [surface, showBookmarksBar]);

  /*
   * Reaching for a tab is asking to see it. The first state arriving is not.
   *
   * The panel describes one particular tab, so it must not linger over another.
   * A surface is worse than lingering: it covers the whole content area and
   * hides every page view, so clicking a tab switched to it, highlighted it in
   * the strip, and showed nothing at all - the browser looked like it had
   * ignored the click.
   *
   * These are chrome rather than pages. There is no address to go back to and
   * nothing to restore, so closing on the way past is what they are: something
   * opened over the top of what you were doing, and dismissed by returning to it.
   */
  const previousTabId = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousTabId.current;
    previousTabId.current = activeTabId;
    if (!reachedForAnotherTab(previous, activeTabId)) {
      return;
    }
    send((api) => api.chrome.closeSiteInfo());
    send((api) => api.chrome.closeBookmarkSheet());
    setSurface('none');
  }, [activeTabId, setSurface]);

  // A surface covers the whole content area, so the tab's view has to step
  // aside - a native view always paints above the renderer's HTML.
  useEffect(() => {
    send((api) => api.chrome.setOverlayVisible(surface !== 'none'));
  }, [surface]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useInterfaceTokens();

  // Turned here rather than by a filter, so what the settings pane names is
  // what the start page paints.
  useEffect(() => {
    // Both pairs, so the stylesheet picks by appearance without another round trip.
    const dark = ambientStopsFor(theme, ambientHue);
    const light = ambientLightStopsFor(theme, ambientHue);
    const root = document.documentElement.style;
    root.setProperty('--ambient-near-dark', dark.near);
    root.setProperty('--ambient-far-dark', dark.far);
    root.setProperty('--ambient-near-light', light.near);
    root.setProperty('--ambient-far-light', light.far);
  }, [theme, ambientHue]);

  // --- render --------------------------------------------------------------

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ground">
      {/* The right padding is the system's own window controls on Windows and Linux, drawn over this strip. */}
      <header className="drag-region flex h-[var(--chrome-header-height)] shrink-0 items-end gap-1 pl-2.5 pr-[var(--window-controls-width)]">
        {/* Room for the macOS traffic lights, which sit inside this strip. */}
        {isMacPlatform() && <div className="w-[74px] shrink-0 self-stretch" aria-hidden />}
        <TabStrip tabs={tabs} activeTabId={activeTabId} groups={groups} />
      </header>

      <Toolbar tab={activeTab} />

      {showBookmarksBar && <BookmarksBar />}

      <LoadingLine isLoading={activeTab?.isLoading ?? false} />

      <LiveAnnouncer />

      <main ref={contentRef} className="relative isolate min-h-0 flex-1 bg-void">
        {/*
          Hidden behind a surface, so it must leave the tab order too. Without
          this, Tab walks out of the open panel and into controls nobody can
          see - nothing looks wrong, focus simply vanishes.
        */}
        <div inert={surface !== 'none'} className="contents">
          {!isRunningInShell() && <OutsideShellNotice />}

          {isReady && split && <SplitView split={split} tabs={tabs} activeTabId={activeTabId} />}
          {isReady && !split && activeTab?.isStartPage && (
            <StartPage tabId={activeTab.id} isHush={activeTab.isHush} />
          )}
          {isReady && !split && activeTab?.error && <ErrorPage tabId={activeTab.id} error={activeTab.error} />}
        </div>

        {surface === 'settings' && <SettingsSurface />}
        {surface === 'history' && <HistorySurface />}
        {surface === 'bookmarks' && <BookmarksSurface />}
        {surface === 'downloads' && <DownloadsSurface />}
        {surface === 'palette' && <CommandPalette />}
        {surface === 'tab-search' && <CommandPalette scope="tabs" />}
        {surface === 'reader' && <ReaderSurface />}
      </main>
    </div>
  );
}

// A single hairline under the toolbar.
function LoadingLine({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="relative h-px w-full shrink-0 overflow-hidden bg-line" aria-hidden>
      {isLoading && <div className="animate-indeterminate h-full w-full bg-active" />}
    </div>
  );
}

function OutsideShellNotice() {
  return (
    <div className="ambient-field flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-body text-ink">{t('shell.chrome.outsideShell.heading')}</p>
      <p className="max-w-md text-body-sm text-ink-faint">
        {t('shell.chrome.outsideShell.runBefore')} <code className="font-mono">npm run dev</code>{' '}
        {t('shell.chrome.outsideShell.runAfter')}
      </p>
    </div>
  );
}
