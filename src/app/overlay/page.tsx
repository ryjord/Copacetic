'use client';

import { useEffect, useRef } from 'react';
import { NoticeStrip } from '@/components/chrome/NoticeStrip/NoticeStrip';
import { send } from '@/lib/bridge';

/**
 * The overlay layer's page.
 *
 * Loaded into a view of its own, stacked above the tabs, so what it draws sits
 * on top of the page instead of pushing it down. It is transparent everywhere
 * it is not drawing, and it reports its own height: the main process cannot
 * know how many lines a message wraps to, and a guessed height either clips the
 * last row or leaves an invisible band that still eats clicks.
 */
export default function OverlayPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    let last = -1;
    const report = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        send((api) => api.chrome.setOverlayHeight(height));
      }
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-screen">
      <NoticeStrip />
    </div>
  );
}
