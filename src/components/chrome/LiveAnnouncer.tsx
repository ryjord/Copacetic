'use client';

import { useEffect, useRef, useState } from 'react';
import { useBrowserStore } from '@/store/useBrowserStore';

/**
 * The running commentary a screen reader would otherwise miss entirely.
 *
 * Almost everything that happens in a browser happens somewhere other than
 * where the keyboard is: a page finishes loading, a site asks for the camera,
 * a download completes. Sighted users catch these from the corner of an eye.
 * With nothing announced, the only signal is that the page under you has
 * silently become a different page.
 *
 * Deliberately terse and polite: an announcement that interrupts what someone
 * is reading to say a download finished is worse than one that waits.
 */
export function LiveAnnouncer() {
  const activeTab = useBrowserStore((state) => state.activeTab);
  const downloads = useBrowserStore((state) => state.downloads);
  const permissionPrompts = useBrowserStore((state) => state.permissionPrompts);

  const [message, setMessage] = useState('');
  const previous = useRef({ loading: false, title: '', completed: 0, prompts: 0 });

  useEffect(() => {
    const was = previous.current;
    const isLoading = activeTab?.isLoading ?? false;
    const title = activeTab?.title ?? '';
    const completed = downloads.filter((download) => download.status === 'completed').length;
    const prompts = permissionPrompts.length;

    let next = '';
    // Ordered by how much the person needs to hear it, not by when it happened.
    if (prompts > was.prompts) {
      next = 'A site is asking for permission.';
    } else if (completed > was.completed) {
      next = 'Download finished.';
    } else if (was.loading && !isLoading && title) {
      next = `Loaded: ${title}`;
    } else if (!was.loading && isLoading) {
      next = 'Loading';
    }

    previous.current = { loading: isLoading, title, completed, prompts };
    if (next) setMessage(next);
  }, [activeTab, downloads, permissionPrompts]);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
