'use client';

// React
import { useEffect, useState } from 'react';

// Icons
import { Check, CircleAlert, Info, X } from 'lucide-react';

// Utils
import { ask, getBridge, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import { type Notice, admit, dismiss, dismissAfterMs } from '@shared/notices';

const LOOK: Record<Notice['tone'], { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'border-active/35 bg-active/10' },
  done: { icon: Check, className: 'border-clear/30 bg-clear/10' },
  ask: { icon: CircleAlert, className: 'border-caution/35 bg-caution/10' },
};

/**
 * What the app has to say.
 *
 * Rendered into the overlay layer rather than the chrome — see
 * `electron/main/app/overlay.ts`. A WebContentsView paints above all of the
 * chrome's HTML, so a notice drawn there could only take space from the page,
 * never sit on top of it. In a view of its own it floats, and nothing moves for
 * something that may last four seconds.
 */
export function NoticeStrip() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const api = getBridge();
    // Collected as well as subscribed to: this page takes over a second to
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
  // clock — a steady trickle would otherwise keep the first one on screen for
  // as long as the trickle lasted.
  useEffect(() => {
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
  }, [notices]);

  if (notices.length === 0) {
    return null;
  }

  const answer = (notice: Notice, confirmed: boolean) => {
    send((api) => api.notices.answer(notice.id, confirmed));
    setNotices((current) => dismiss(current, notice.id));
  };

  return (
    <div className="flex shrink-0 flex-col">
      {notices.map((notice) => {
        const { icon: Icon, className } = LOOK[notice.tone];

        return (
          <div
            key={notice.id}
            role="status"
            className={cn('flex items-center gap-2.5 border-b px-3 py-2 text-[12px]', className)}
          >
            <Icon size={13} className="shrink-0 text-ink-dim" />
            <span className="min-w-0 flex-1 text-ink-dim">{notice.message}</span>

            {notice.tone === 'ask' && notice.confirm && (
              <button
                type="button"
                onClick={() => answer(notice, true)}
                className="shrink-0 rounded-field border border-line-strong px-2.5 py-1 text-[11.5px] text-ink transition-colors hover:bg-raised"
              >
                {notice.confirm}
              </button>
            )}

            <button
              type="button"
              // A question that is closed is a question answered with no, which
              // is a real answer and has to reach whatever asked it.
              aria-label={notice.tone === 'ask' ? 'No' : 'Dismiss'}
              onClick={() => answer(notice, false)}
              className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
