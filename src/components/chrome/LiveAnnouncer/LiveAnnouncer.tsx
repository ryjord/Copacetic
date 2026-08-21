'use client';

import { useEffect, useRef, useState } from 'react';
import { useBrowserStore } from '@/store/useBrowserStore';

/** The running commentary a screen reader would otherwise miss entirely. */
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
    if (next) {
      setMessage(next);
    }
  }, [activeTab, downloads, permissionPrompts]);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
