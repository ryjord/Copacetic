'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { BookmarksSurface } from '@/components/surfaces/BookmarksSurface';
import { CommandPalette } from '@/components/surfaces/CommandPalette';
import { DownloadsSurface } from '@/components/surfaces/DownloadsSurface';
import { HistorySurface } from '@/components/surfaces/HistorySurface';
import { SettingsSurface } from '@/components/surfaces/SettingsSurface';
import { ErrorPage } from '@/components/content/ErrorPage';
import { StartPage } from '@/components/content/StartPage';
import { getBridge, isRunningInShell, send } from '@/lib/bridge';
import { useBrowserStore } from '@/store/useBrowserStore';
import { AuthBanner } from './AuthBanner';
import { ConnectionPanel } from './ConnectionPanel';
import { FindBar } from './FindBar';
import { PermissionBanner } from './PermissionBanner';
import { TabStrip } from './TabStrip';
import { Toolbar } from './Toolbar';
import { WindowControls } from './WindowControls';

/**
 * The browser shell.
 *
 * Everything above `contentRef` is chrome the renderer draws. Everything
 * inside it belongs to the main process, which parks a `WebContentsView`
 * exactly over that rectangle. The renderer's only job there is to report how
 * big the hole is and to draw Copacetic's own pages — start and error — when
 * there is no site to show.
 */
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
  const isConnectionPanelOpen = useBrowserStore((state) => state.isConnectionPanelOpen);
  const closeConnectionPanel = useBrowserStore((state) => state.closeConnectionPanel);

  const contentRef = useRef<HTMLDivElement>(null);

  // --- wiring to the main process -----------------------------------------

  useEffect(() => {
    const api = getBridge();
    if (!api) return;

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
    if (!element || !isRunningInShell()) return;

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
      if (signature === last) return;
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
  }, [find.isOpen, permissionPrompts.length, surface, isConnectionPanelOpen, authPrompts.length]);

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

  // --- render --------------------------------------------------------------

  const prompt = permissionPrompts.find((candidate) => candidate.tabId === activeTabId) ?? null;
  // A proxy challenge belongs to no tab, so it is shown whichever tab is open.
  const authPrompt = authPrompts.find((candidate) => candidate.tabId === activeTabId || candidate.isProxy) ?? null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-base">
      <header className="drag-region flex h-[var(--chrome-header-height)] shrink-0 items-center gap-1 px-2.5 pt-1.5">
        {/* Room for the macOS traffic lights, which sit inside this strip. */}
        {isMac() && <div className="w-[68px] shrink-0" aria-hidden />}
        <TabStrip tabs={tabs} activeTabId={activeTabId} />
        {!isMac() && <WindowControls />}
      </header>

      <Toolbar tab={activeTab} />

      <LoadingLine isLoading={activeTab?.isLoading ?? false} />

      {authPrompt && <AuthBanner key={authPrompt.id} prompt={authPrompt} />}
      {isConnectionPanelOpen && <ConnectionPanel tab={activeTab} />}
      {find.isOpen && <FindBar find={find} />}
      {prompt && <PermissionBanner prompt={prompt} />}

      <main ref={contentRef} className="relative min-h-0 flex-1 bg-void">
        {!isRunningInShell() && <OutsideShellNotice />}

        {isReady && activeTab?.isStartPage && <StartPage tabId={activeTab.id} />}
        {isReady && activeTab?.error && <ErrorPage tabId={activeTab.id} error={activeTab.error} />}

        {surface === 'settings' && <SettingsSurface />}
        {surface === 'history' && <HistorySurface />}
        {surface === 'bookmarks' && <BookmarksSurface />}
        {surface === 'downloads' && <DownloadsSurface />}
        {surface === 'palette' && <CommandPalette />}
      </main>
    </div>
  );
}

/**
 * A single hairline under the toolbar. It is the only ambient motion in the
 * chrome, so a moving page is unmistakable without anything else animating.
 */
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
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac');
}
