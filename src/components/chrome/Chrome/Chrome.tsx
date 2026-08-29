'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { BookmarksSurface } from '@/views/BookmarksSurface/BookmarksSurface';
import { CommandPalette } from '@/views/CommandPalette/CommandPalette';
import { DownloadsSurface } from '@/views/DownloadsSurface/DownloadsSurface';
import { HistorySurface } from '@/views/HistorySurface/HistorySurface';
import { SettingsSurface } from '@/views/SettingsSurface/SettingsSurface';
import { ErrorPage } from '@/components/pages/ErrorPage/ErrorPage';
import { StartPage } from '@/components/pages/StartPage/StartPage';
import { getBridge, isRunningInShell, send } from '@/lib/bridge';
import { ambientStopsFor } from '@shared/ambient';
import { useBrowserStore } from '@/store/useBrowserStore';
import { AuthBanner } from '@/components/chrome/AuthBanner/AuthBanner';
import { BookmarksBar } from '@/components/chrome/BookmarksBar/BookmarksBar';
import { ConnectionPanel } from '@/components/chrome/ConnectionPanel/ConnectionPanel';
import { FindBar } from '@/components/chrome/FindBar/FindBar';
import { LiveAnnouncer } from '@/components/chrome/LiveAnnouncer/LiveAnnouncer';
import { PermissionBanner } from '@/components/chrome/PermissionBanner/PermissionBanner';
import { TabStrip } from '@/components/chrome/TabStrip/TabStrip';
import { Toolbar } from '@/components/chrome/Toolbar/Toolbar';
import { WindowControls } from '@/components/chrome/WindowControls/WindowControls';

/** The browser shell. */
export function Chrome() {
  const applyState = useBrowserStore((state) => state.applyState);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const requestOmniboxFocus = useBrowserStore((state) => state.requestOmniboxFocus);

  const isReady = useBrowserStore((state) => state.isReady);
  const surface = useBrowserStore((state) => state.surface);
  const find = useBrowserStore((state) => state.find);
  const theme = useBrowserStore((state) => state.settings.theme);
  const permissionPrompts = useBrowserStore((state) => state.permissionPrompts);
  const tabs = useBrowserStore((state) => state.orderedTabs);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const activeTabId = useBrowserStore((state) => state.activeTabId);

  const authPrompts = useBrowserStore((state) => state.authPrompts);
  const density = useBrowserStore((state) => state.settings.density);
  const groups = useBrowserStore((state) => state.groups);
  const ambientHue = useBrowserStore((state) => state.settings.ambientHue);
  const showBookmarksBar = useBrowserStore((state) => state.settings.showBookmarksBar);
  const isConnectionPanelOpen = useBrowserStore((state) => state.isConnectionPanelOpen);
  const closeConnectionPanel = useBrowserStore((state) => state.closeConnectionPanel);

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
  }, [find.isOpen, permissionPrompts.length, surface, isConnectionPanelOpen, authPrompts.length, showBookmarksBar]);

  // The panel describes one particular tab, so it must not linger over another.
  useEffect(() => {
    closeConnectionPanel();
  }, [activeTabId, closeConnectionPanel]);

  // A surface covers the whole content area, so the tab's view has to step
  // aside — a native view always paints above the renderer's HTML.
  useEffect(() => {
    send((api) => api.chrome.setOverlayVisible(surface !== 'none'));
  }, [surface]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // Turned here rather than by a filter, so what the settings pane names is
  // what the start page paints.
  useEffect(() => {
    const { near, far } = ambientStopsFor(theme, ambientHue);
    document.documentElement.style.setProperty('--ambient-near', near);
    document.documentElement.style.setProperty('--ambient-far', far);
  }, [theme, ambientHue]);

  // --- render --------------------------------------------------------------

  const prompt = permissionPrompts.find((candidate) => candidate.tabId === activeTabId) ?? null;
  // A proxy challenge belongs to no tab, so it is shown whichever tab is open.
  const authPrompt = authPrompts.find((candidate) => candidate.tabId === activeTabId || candidate.isProxy) ?? null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-base">
      <header className="drag-region flex h-[var(--chrome-header-height)] shrink-0 items-center gap-1 px-2.5 pt-1.5">
        {/* Room for the macOS traffic lights, which sit inside this strip. */}
        {isMac() && <div className="w-[68px] shrink-0" aria-hidden />}
        <TabStrip tabs={tabs} activeTabId={activeTabId} groups={groups} />
        {!isMac() && <WindowControls />}
      </header>

      <Toolbar tab={activeTab} />

      {showBookmarksBar && <BookmarksBar />}

      <LoadingLine isLoading={activeTab?.isLoading ?? false} />

      {authPrompt && <AuthBanner key={authPrompt.id} prompt={authPrompt} />}
      {isConnectionPanelOpen && <ConnectionPanel tab={activeTab} />}
      {find.isOpen && <FindBar find={find} />}
      {prompt && <PermissionBanner prompt={prompt} />}

      <LiveAnnouncer />

      <main ref={contentRef} className="relative min-h-0 flex-1 bg-void">
        {/*
          Hidden behind a surface, so it must leave the tab order too. Without
          this, Tab walks out of the open panel and into controls nobody can
          see — nothing looks wrong, focus simply vanishes.
        */}
        <div inert={surface !== 'none'} className="contents">
          {!isRunningInShell() && <OutsideShellNotice />}

          {isReady && activeTab?.isStartPage && <StartPage tabId={activeTab.id} isHush={activeTab.isHush} />}
          {isReady && activeTab?.error && <ErrorPage tabId={activeTab.id} error={activeTab.error} />}
        </div>

        {surface === 'settings' && <SettingsSurface />}
        {surface === 'history' && <HistorySurface />}
        {surface === 'bookmarks' && <BookmarksSurface />}
        {surface === 'downloads' && <DownloadsSurface />}
        {surface === 'palette' && <CommandPalette />}
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
      <p className="text-[13px] text-ink">This is Copacetic&apos;s interface, running without its browser engine.</p>
      <p className="max-w-md text-[12px] leading-relaxed text-ink-faint">
        Tabs, navigation and downloads live in the Electron main process. Run{' '}
        <code className="font-mono">npm run dev</code> to start the full browser.
      </p>
    </div>
  );
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.platform.toLowerCase().includes('mac');
}
