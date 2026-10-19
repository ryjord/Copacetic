'use client';

// Libs
import { useEffect, useRef, useSyncExternalStore } from 'react';

// Components
import { FindBar } from '@/components/overlay/FindBar/FindBar';
import { FinishedDownloads } from '@/components/overlay/Downloads/FinishedDownloads';
import { NoticeStrip } from '@/components/overlay/Notices/NoticeStrip';
import { PermissionCard } from '@/components/overlay/PermissionPrompt/PermissionCard';
import { SignInCard } from '@/components/overlay/AuthPrompt/SignInCard';
import { SiteInfoCard } from '@/components/overlay/SiteInfo/SiteInfoCard';
import { SuggestionList } from '@/components/overlay/Suggestions/SuggestionList';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';

// Types
import { type OverlayRegion, isOverlayRegion } from '@shared/chrome/overlay-regions';

/**
 * One overlay layer's page: what is drawn over one top corner of the page.
 *
 * Laid out at its natural size against its own corner and measured, so the
 * main process can make the view exactly that size and leave the rest of the
 * page clickable.
 */
export default function OverlayPage() {
  const region = useRegion();
  const applyState = useBrowserStore((state) => state.applyState);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = getBridge();
    if (!api) {
      return;
    }
    void api.chrome.getState().then(applyState);
    return api.on.state(applyState);
  }, [applyState]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    let last = '';
    const report = () => {
      const box = element.getBoundingClientRect();
      // Nothing drawn is no size at all, so the view hides rather than leaving its padding behind.
      const isEmpty = element.childElementCount === 0;
      const width = isEmpty ? 0 : Math.ceil(box.width);
      const height = isEmpty ? 0 : Math.ceil(box.height);
      const signature = `${width}x${height}`;
      if (signature !== last) {
        last = signature;
        send((api) => api.chrome.setOverlaySize(width, height));
      }
    };

    report();
    const resizes = new ResizeObserver(report);
    resizes.observe(element);
    const changes = new MutationObserver(report);
    changes.observe(element, { childList: true });
    return () => {
      resizes.disconnect();
      changes.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-overlay-region={region ?? ''}
      // Padding so a card's shadow is inside the view rather than cut off at its edge.
      className={cn('flex w-max flex-col gap-2 p-2', region === 'trailing' ? 'ml-auto items-end' : 'items-start')}
    >
      {region === 'leading' && <LeadingRegion />}
      {region === 'trailing' && <TrailingRegion />}
    </div>
  );
}

/** What a site is asking, held to the corner nearest the address it came from. */
function LeadingRegion() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const siteInfoTabId = useBrowserStore((state) => state.siteInfo?.tabId ?? null);
  const permissionPrompts = useBrowserStore((state) => state.permissionPrompts);
  const authPrompts = useBrowserStore((state) => state.authPrompts);
  const prompt = permissionPrompts.find((candidate) => candidate.tabId === activeTabId);
  // A proxy challenge belongs to no tab, so it is shown whichever tab is open.
  const authPrompt = authPrompts.find((candidate) => candidate.tabId === activeTabId || candidate.isProxy);
  return (
    <>
      <SuggestionList />
      {activeTab && siteInfoTabId === activeTab.id && <SiteInfoCard tab={activeTab} />}
      {authPrompt && <SignInCard key={authPrompt.id} prompt={authPrompt} />}
      {prompt && <PermissionCard key={prompt.id} prompt={prompt} />}
    </>
  );
}

function TrailingRegion() {
  const find = useBrowserStore((state) => state.find);
  return (
    <>
      {find.isOpen && <FindBar find={find} />}
      <NoticeStrip />
      <FinishedDownloads />
    </>
  );
}

function useRegion(): OverlayRegion | null {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const region = new URLSearchParams(window.location.search).get('region');
      return isOverlayRegion(region) ? region : null;
    },
    () => null,
  );
}
