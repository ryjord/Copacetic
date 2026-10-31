'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { Check, CircleAlert, Info, Undo2, X } from 'lucide-react';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import { type Notice, admit, dismiss, dismissAfterMs } from '@shared/chrome/notices';

const LOOK: Record<Notice['tone'], { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-ink-dim' },
  done: { icon: Check, className: 'text-ink-dim' },
  ask: { icon: CircleAlert, className: 'text-caution' },
  undo: { icon: Undo2, className: 'text-ink-dim' },
};

/** What the app has to say, as cards over the page's top-right corner, so nothing moves for something that lasts four seconds. */
export function NoticeStrip() {
  const [notices, setNotices] = useState<Notice[]>([]);
  // Paused while the pointer or keyboard is on the strip, so reaching for Undo never races the notice away.
  const [isHeld, setIsHeld] = useState(false);

  useEffect(() => {
    const api = getBridge();
    // Collected as well as subscribed to: this page is listening some time to
    // start listening, so anything said during startup was said to nobody.
    void ask((subject) => subject.notices.pending(), []).then((waiting) =>
      setNotices((current) => waiting.reduce(admit, current)),
    );
    const stop = [
      api?.on.notice((notice) => setNotices((current) => admit(current, notice))),
      // Settled elsewhere: the main process answers a question from the API or
      // another window, and this is the only thing that would still be drawing it.
      api?.on.noticeSettled((id) => setNotices((current) => dismiss(current, id))),
    ];
    return () => stop.forEach((unsubscribe) => unsubscribe?.());
  }, []);

  // Each notice times itself out, so one arriving does not restart another's
  // clock - a steady trickle would otherwise keep the first one on screen for
  // as long as the trickle lasted.
  useEffect(() => {
    if (isHeld) {
      return;
    }
    const timers = notices
      .map((notice) => {
        const after = dismissAfterMs(notice.tone);
        if (after === null) {
          return null;
        }
        return setTimeout(() => {
          // Told to the main process too, so what it holds for a chrome that
          // was not listening does not grow without limit.
          send((api) => api.notices.answer(notice.id, false));
          setNotices((current) => dismiss(current, notice.id));
        }, after);
      })
      .filter((timer): timer is ReturnType<typeof setTimeout> => timer !== null);

    return () => timers.forEach(clearTimeout);
  }, [notices, isHeld]);

  if (notices.length === 0) {
    return null;
  }

  const answer = (notice: Notice, confirmed: boolean) => {
    send((api) => api.notices.answer(notice.id, confirmed));
    setNotices((current) => dismiss(current, notice.id));
  };

  return (
    <div
      className="flex flex-col items-end gap-2"
      onPointerEnter={() => setIsHeld(true)}
      onPointerLeave={() => setIsHeld(false)}
      onFocus={() => setIsHeld(true)}
      onBlur={(event) => {
        // Still held while focus moves between its own buttons.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsHeld(false);
        }
      }}
    >
      {notices.map((notice) => {
        const { icon: Icon, className } = LOOK[notice.tone];
        return (
          <div
            key={notice.id}
            role="status"
            className="animate-pop flex w-85 items-start gap-2.5 rounded-lg border border-line bg-raised py-2.5 pl-3 pr-1.5 shadow-popover"
          >
            <Icon size={16} strokeWidth={1.75} className={cn('mt-px shrink-0', className)} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2 pt-px">
              <p className="text-body text-ink">{notice.message}</p>
              {(notice.tone === 'ask' || notice.tone === 'undo') && notice.confirm && (
                <Button size="sm" variant="primary" onClick={() => answer(notice, true)}>
                  {notice.confirm}
                </Button>
              )}
            </div>
            <IconButton
              // A question that is closed is a question answered with no, which is a real answer.
              label={
                notice.tone === 'ask' ? t('shell.overlay.noticeStrip.no') : t('shell.overlay.noticeStrip.dismiss')
              }
              size="sm"
              onClick={() => answer(notice, false)}
            >
              <X size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
