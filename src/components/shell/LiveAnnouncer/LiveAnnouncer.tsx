'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { t } from '@shared/i18n/translate';

/** The running commentary a screen reader would otherwise miss entirely. */
export function LiveAnnouncer() {
  const activeTab = useBrowserStore((state) => state.activeTab);
  const downloads = useBrowserStore((state) => state.downloads);
  const permissionPrompts = useBrowserStore((state) => state.permissionPrompts);
  const passwordOffer = useBrowserStore((state) => state.passwordOffer);

  const [message, setMessage] = useState('');
  const previous = useRef({ loading: false, title: '', completed: 0, prompts: 0, offerId: '' });

  useEffect(() => {
    const was = previous.current;
    const isLoading = activeTab?.isLoading ?? false;
    const title = activeTab?.title ?? '';
    const completed = downloads.filter((download) => download.status === 'completed').length;
    const prompts = permissionPrompts.length;
    const offerId = passwordOffer?.id ?? '';

    let next = '';
    // Ordered by how much the person needs to hear it, not by when it happened.
    if (prompts > was.prompts) {
      next = t('shell.liveAnnouncer.permissionRequested');
    } else if (passwordOffer && offerId !== was.offerId) {
      // The card does not take focus, so without this the offer is only seen.
      next = t('shell.liveAnnouncer.passwordOffered', { site: passwordOffer.site });
    } else if (completed > was.completed) {
      next = t('shell.liveAnnouncer.downloadFinished');
    } else if (was.loading && !isLoading && title) {
      next = t('shell.liveAnnouncer.loaded', { title });
    } else if (!was.loading && isLoading) {
      next = t('shell.liveAnnouncer.loading');
    }

    previous.current = { loading: isLoading, title, completed, prompts, offerId };
    if (next) {
      setMessage(next);
    }
  }, [activeTab, downloads, permissionPrompts, passwordOffer]);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
