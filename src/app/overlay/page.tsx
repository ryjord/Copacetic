'use client';

// Libs
import { useEffect, useRef, useSyncExternalStore } from 'react';

// Components
import { FindBar } from '@/components/overlay/FindBar/FindBar';
import { NoticeStrip } from '@/components/overlay/Notices/NoticeStrip';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { getBridge, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import { type OverlayRegion, isOverlayRegion } from '@shared/overlay-regions';

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
      {region === 'trailing' && <TrailingRegion />}
    </div>
  );
}

function TrailingRegion() {
  const find = useBrowserStore((state) => state.find);
  return (
    <>
      {find.isOpen && <FindBar find={find} />}
      <NoticeStrip />
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
