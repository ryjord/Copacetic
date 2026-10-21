'use client';

// Libs
import { useEffect, useLayoutEffect, useRef } from 'react';

// Components
import { CommandPalette } from '@/components/views/palette/CommandPalette';
import { ReaderSurface } from '@/components/views/reader/ReaderSurface';
import { ErrorPage } from '@/components/views/error/ErrorPage';
import { BookmarksBar } from '@/components/shell/BookmarksBar/BookmarksBar';
import { InternalPage } from '@/components/shell/InternalPage/InternalPage';
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
  const isOneLine = useBrowserStore((state) => state.settings.headerLayout === 'one-line');

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
    ];

    // Anything asked for before this listener existed was pushed to nobody. The
    // main process holds the last one; collecting it here is what makes Cmd+K
    // during the second and a half this page takes to hydrate do something.
    void api.chrome.pendingSurface().then((pending) => {
      if (pending) {
        setSurface(pending);
      }
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [applyState, requestOmniboxFocus, setSurface]);

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
  }, [surface, showBookmarksBar, isOneLine]);

  // Reaching for another tab is asking to see it, so an overlay over the last one closes; the first state arriving is not.
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
      {isOneLine ? (
        <header className="shrink-0">
          <Toolbar
            tab={activeTab}
            tabStrip={<TabStrip tabs={tabs} activeTabId={activeTabId} groups={groups} isNarrow />}
          />
        </header>
      ) : (
        <header className="shrink-0">
          {/* The right padding is the system's own window controls on Windows and Linux, drawn over this strip. */}
          <div className="drag-region flex h-[var(--chrome-header-height)] shrink-0 items-center gap-1 pl-2.5 pr-[var(--window-controls-width)]">
            {/* Room for the macOS traffic lights, which sit inside this strip. */}
            {isMacPlatform() && <div className="w-[74px] shrink-0 self-stretch" aria-hidden />}
            <TabStrip tabs={tabs} activeTabId={activeTabId} groups={groups} />
          </div>
          <Toolbar tab={activeTab} />
        </header>
      )}

      {showBookmarksBar && <BookmarksBar />}

      <LoadingLine isLoading={activeTab?.isLoading ?? false} />

      <LiveAnnouncer />

      {/* Framed rather than edge to edge: the page's own view is rounded to match in the main process. */}
      <main
        ref={contentRef}
        className="relative isolate mx-2 mb-2 min-h-0 flex-1 overflow-hidden rounded-[var(--frame-radius)] bg-void shadow-[0_0_0_1px_var(--color-line)]"
      >
        {/*
          Hidden behind a surface, so it must leave the tab order too. Without
          this, Tab walks out of the open panel and into controls nobody can
          see - nothing looks wrong, focus simply vanishes.
        */}
        <div inert={surface !== 'none'} className="contents">
          {!isRunningInShell() && <OutsideShellNotice />}

          {isReady && split && <SplitView split={split} tabs={tabs} activeTabId={activeTabId} />}
          {isReady && !split && activeTab?.internalPage && <InternalPage tab={activeTab} />}
          {isReady && !split && activeTab?.error && <ErrorPage tabId={activeTab.id} error={activeTab.error} />}
        </div>

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
    // Inset with the page's frame, and seen only while something loads: an idle line across the window was one more rule.
    <div className="relative mx-3 h-px shrink-0 overflow-hidden" aria-hidden>
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
