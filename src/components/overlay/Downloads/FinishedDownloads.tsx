'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { CircleAlert, FileCheck, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { formatBytes } from '@/lib/text/format';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { DownloadState } from '@shared/types';

const SHOWN_FOR_MS = 8_000;
const MOST_AT_ONCE = 2;

/**
 * A download that just finished, with the two things people do next.
 *
 * Only ones that finish while this overlay is open: a list of last week's
 * downloads appearing at launch would be noise, and Downloads holds them anyway.
 */
export function FinishedDownloads() {
  const downloads = useBrowserStore((state) => state.downloads);
  // When this overlay started, read once, so nothing that ended before it is shown.
  const [openedAt] = useState(() => Date.now());
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());

  const finished = downloads
    .filter(
      (download) =>
        (download.status === 'completed' || download.status === 'interrupted') &&
        (download.completedAt ?? 0) >= openedAt &&
        !closed.has(download.id),
    )
    .toSorted((aDownload, bDownload) => (bDownload.completedAt ?? 0) - (aDownload.completedAt ?? 0))
    .slice(0, MOST_AT_ONCE);

  const close = (id: string) => setClosed((current) => new Set([...current, id]));

  return (
    <>
      {finished.map((download) => (
        <FinishedCard key={download.id} download={download} onClose={() => close(download.id)} />
      ))}
    </>
  );
}

function FinishedCard({ download, onClose }: { download: DownloadState; onClose: () => void }) {
  const [isHeld, setIsHeld] = useState(false);
  // Why the file would not open, said on the card the button is on.
  const [problem, setProblem] = useState('');
  const isComplete = download.status === 'completed';

  // Paused while the pointer or the keyboard is on it, so reaching for a button never races the card away.
  useEffect(() => {
    if (isHeld) {
      return;
    }
    const timer = setTimeout(onClose, SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [isHeld, onClose]);

  const Icon = isComplete ? FileCheck : CircleAlert;
  return (
    <div
      role="status"
      onPointerEnter={() => setIsHeld(true)}
      onPointerLeave={() => setIsHeld(false)}
      onFocus={() => setIsHeld(true)}
      onBlur={(event) => {
        // Still held while focus moves between its own buttons.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsHeld(false);
        }
      }}
      className="animate-pop flex w-85 items-start gap-2.5 rounded-lg border border-line bg-raised py-2.5 pl-3 pr-1.5 shadow-popover"
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={cn('mt-px shrink-0', isComplete ? 'text-clear' : 'text-caution')}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 pt-px">
        <div className="flex w-full min-w-0 flex-col">
          <p className="truncate text-body text-ink" title={download.filename}>
            {download.filename}
          </p>
          <p className="text-body-sm text-ink-dim">
            {isComplete
              ? t('shell.overlay.finishedDownload.done', { size: formatBytes(download.totalBytes) })
              : t('shell.overlay.finishedDownload.failed')}
          </p>
          {problem && <p className="text-body-sm text-alert">{problem}</p>}
        </div>
        <div className="flex gap-1.5">
          {isComplete ? (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void ask((api) => api.downloads.openFile(download.id), '').then(setProblem)}
              >
                {t('shell.overlay.finishedDownload.open')}
              </Button>
              <Button size="sm" onClick={() => send((api) => api.downloads.revealFile(download.id))}>
                {t('shell.overlay.finishedDownload.reveal')}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => send((api) => api.downloads.retry(download.id))}>
              {t('shell.overlay.finishedDownload.retry')}
            </Button>
          )}
        </div>
      </div>
      <IconButton label={t('shell.overlay.noticeStrip.dismiss')} size="sm" onClick={onClose}>
        <X size={14} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
