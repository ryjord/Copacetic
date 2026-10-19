'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { SearchField } from '@/components/ui/TextField/TextField';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

// Icons
import { ChevronDown, Download, File, FolderOpen, Pause, Play, RotateCw, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge';
import { formatBytes, formatDateHeading, formatEta, formatRate, formatTimeOfDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { DownloadState } from '@shared/types';
import { crossedSites, describeChain } from '@shared/download-provenance';

export function DownloadsSurface() {
  const downloads = useBrowserStore((state) => state.downloads);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');

  const isFinished = (download: DownloadState) => download.status !== 'progressing' && download.status !== 'paused';
  const needle = query.trim().toLowerCase();
  const shown = downloads.filter((download) => !needle || download.filename.toLowerCase().includes(needle));

  return (
    <SurfaceShell
      title={t('views.downloads.title')}
      actions={
        <>
          {downloads.length > 0 && (
            <SearchField value={query} onChange={setQuery} label={t('views.downloads.search')} className="w-56" />
          )}
          {downloads.some(isFinished) && (
            <Button size="sm" onClick={() => send((api) => api.downloads.clearCompleted())}>
              {t('views.downloads.clearFinished')}
            </Button>
          )}
        </>
      }
    >
      <div className="mx-auto w-full max-w-220 px-4 pb-8">
        {notice && (
          <p role="status" className="mt-4 rounded-sm bg-caution/10 px-3 py-2 text-body-sm text-caution">
            {notice}
          </p>
        )}
        {downloads.length === 0 ? (
          <EmptyState icon={Download} title={t('views.downloads.empty')} hint={t('views.downloads.emptyHint')} />
        ) : shown.length === 0 ? (
          <EmptyState title={t('views.downloads.noMatches')} hint={t('views.downloads.noMatchesHint')} />
        ) : (
          groupByDay(shown).map(([heading, items]) => (
            <section key={heading}>
              <h2 className="label px-3 pb-1.5 pt-5">{heading}</h2>
              <ul className="flex flex-col">
                {items.map((download) => (
                  <DownloadRow key={download.id} download={download} onNotice={setNotice} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </SurfaceShell>
  );
}

function DownloadRow({ download, onNotice }: { download: DownloadState; onNotice: (message: string) => void }) {
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const isActive = download.status === 'progressing' || download.status === 'paused';
  const isOpenable = download.status === 'completed' && download.fileExists;
  const hasKnownSize = download.totalBytes > 0;
  const percent = hasKnownSize ? Math.min(100, (download.receivedBytes / download.totalBytes) * 100) : 0;
  const route = describeChain(download.urlChain);
  const isElsewhere = crossedSites(download.urlChain);
  const hasDetails = Boolean((route && !isElsewhere) || download.sha256);

  const open = async () => {
    const message = await ask((api) => api.downloads.openFile(download.id), '');
    if (message) {
      onNotice(message);
    }
  };

  return (
    <li className="group rounded-sm px-3 py-2.5 hover:bg-hover">
      <div className="flex items-center gap-3">
        <File size={20} strokeWidth={1.5} className="shrink-0 text-ink-faint" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isOpenable}
              onClick={() => void open()}
              title={download.savePath}
              className={cn(
                'min-w-0 truncate text-left text-body',
                isOpenable ? 'text-ink hover:underline' : 'cursor-default text-ink-dim',
              )}
            >
              {download.filename}
            </button>
            <DownloadPill download={download} />
          </div>
          <p className="mt-0.5 truncate text-body-sm text-ink-dim tabular-nums">{detailLine(download)}</p>
          {/* Shown on the row rather than behind Details: a file from somewhere other than where you clicked is worth seeing. */}
          {isElsewhere && route && <p className="mt-0.5 text-body-sm text-caution">{route}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {download.status === 'progressing' && (
            <IconButton
              label={t('views.downloads.pause')}
              onClick={() => send((api) => api.downloads.pause(download.id))}
            >
              <Pause size={16} />
            </IconButton>
          )}
          {download.isHeld && (
            <>
              <Button size="sm" variant="ghost" onClick={() => send((api) => api.downloads.discard(download.id))}>
                {t('views.downloads.discard')}
              </Button>
              <Button size="sm" onClick={() => send((api) => api.downloads.keep(download.id))}>
                {t('views.downloads.keep')}
              </Button>
            </>
          )}
          {download.status === 'paused' && !download.isHeld && (
            <IconButton
              label={t('views.downloads.resume')}
              onClick={() => send((api) => api.downloads.resume(download.id))}
            >
              <Play size={16} />
            </IconButton>
          )}
          {isActive && !download.isHeld && (
            <IconButton
              label={t('views.downloads.cancel')}
              onClick={() => send((api) => api.downloads.cancel(download.id))}
            >
              <X size={16} />
            </IconButton>
          )}
          {(download.status === 'interrupted' || download.status === 'cancelled') && (
            <IconButton
              label={t('views.downloads.retry')}
              onClick={() => send((api) => api.downloads.retry(download.id))}
            >
              <RotateCw size={16} />
            </IconButton>
          )}
          {isOpenable && (
            <IconButton
              label={t('views.downloads.showInFolder')}
              onClick={() => send((api) => api.downloads.revealFile(download.id))}
            >
              <FolderOpen size={16} />
            </IconButton>
          )}
          {hasDetails && (
            <IconButton
              label={isShowingDetails ? t('views.downloads.hideDetails') : t('views.downloads.showDetails')}
              aria-expanded={isShowingDetails}
              onClick={() => setIsShowingDetails((shown) => !shown)}
            >
              <ChevronDown size={16} className={cn('transition-transform', isShowingDetails && 'rotate-180')} />
            </IconButton>
          )}
          {!isActive && (
            <IconButton
              label={t('views.downloads.remove')}
              className="opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => send((api) => api.downloads.remove(download.id))}
            >
              <X size={16} />
            </IconButton>
          )}
        </div>
      </div>

      {isActive && (
        <div className="ml-8 mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          {hasKnownSize ? (
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          ) : (
            <div className="animate-indeterminate h-full w-full rounded-full bg-accent" />
          )}
        </div>
      )}

      {/* Where it came from, and what arrived: a checksum you were never shown is one you cannot compare. */}
      {isShowingDetails && (
        <dl className="ml-8 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          {route && !isElsewhere && (
            <>
              <dt className="text-ink-faint">{t('views.downloads.from')}</dt>
              <dd className="min-w-0 break-all text-ink-dim select-text">{route}</dd>
            </>
          )}
          {download.sha256 && (
            <>
              <dt className="text-ink-faint">SHA-256</dt>
              <dd className="min-w-0 break-all font-mono text-ink-dim select-text">{download.sha256}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}

/** Only states worth noticing get a word; a finished download is the ordinary case and says nothing. */
function DownloadPill({ download }: { download: DownloadState }) {
  // Said before anything else: this one is waiting on the person, not on the network.
  if (download.isHeld) {
    return <StatusPill status="warning">{t('views.downloads.pill.held')}</StatusPill>;
  }
  if (download.status === 'paused') {
    return <StatusPill status="warning">{t('views.downloads.pill.paused')}</StatusPill>;
  }
  if (download.status === 'interrupted') {
    return <StatusPill status="danger">{t('views.downloads.pill.failed')}</StatusPill>;
  }
  if (download.status === 'cancelled') {
    return <StatusPill status="neutral">{t('views.downloads.pill.cancelled')}</StatusPill>;
  }
  if (download.status === 'completed' && !download.fileExists) {
    return <StatusPill status="neutral">{t('views.downloads.pill.missing')}</StatusPill>;
  }
  // The file is saved, but where it came from is not written down; the row goes when Copacetic closes.
  if (download.isHush) {
    return <StatusPill status="hush">Hush</StatusPill>;
  }
  return null;
}

function detailLine(download: DownloadState): string {
  const parts: string[] = [];
  if (download.status === 'progressing' || download.status === 'paused') {
    parts.push(
      download.totalBytes > 0
        ? t('views.downloads.progress', {
            received: formatBytes(download.receivedBytes),
            total: formatBytes(download.totalBytes),
          })
        : formatBytes(download.receivedBytes),
    );
    if (download.status === 'progressing') {
      parts.push(
        formatRate(download.bytesPerSecond),
        formatEta(download.receivedBytes, download.totalBytes, download.bytesPerSecond),
      );
    }
  } else {
    parts.push(formatBytes(download.receivedBytes));
  }
  parts.push(hostFor(download.url));
  if (download.completedAt && !(download.status === 'progressing' || download.status === 'paused')) {
    parts.push(formatTimeOfDay(download.completedAt));
  }
  return parts.filter(Boolean).join(' · ');
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function groupByDay(downloads: DownloadState[]): [string, DownloadState[]][] {
  const groups = new Map<string, DownloadState[]>();
  for (const download of downloads) {
    const heading = formatDateHeading(download.startedAt);
    groups.set(heading, [...(groups.get(heading) ?? []), download]);
  }
  return [...groups.entries()];
}
