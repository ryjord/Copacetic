'use client';

import { FolderOpen, Pause, Play, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { DownloadState } from '../../../electron/shared/types';
import { IconButton } from '@/components/ui/IconButton';
import { send } from '@/lib/bridge';
import { formatBytes, formatEta, formatRate, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBrowserStore } from '@/store/useBrowserStore';
import { EmptyState, SurfaceShell } from './SurfaceShell';

export function DownloadsSurface() {
  const downloads = useBrowserStore((state) => state.downloads);
  const [notice, setNotice] = useState('');

  const hasFinished = downloads.some((download) => download.status !== 'progressing' && download.status !== 'paused');

  return (
    <SurfaceShell
      title="Downloads"
      subtitle="Files Copacetic saved to your Downloads folder."
      actions={
        hasFinished ? (
          <button
            type="button"
            onClick={() => send((api) => api.downloads.clearCompleted())}
            className="rounded-md px-2.5 py-1 text-[12px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
          >
            Clear finished
          </button>
        ) : null
      }
    >
      {notice && <p className="border-b border-line bg-raised px-6 py-2 text-[12px] text-caution">{notice}</p>}

      {downloads.length === 0 ? (
        <EmptyState title="Nothing downloaded yet" hint="Files you download will be listed here." />
      ) : (
        <ul className="divide-y divide-line">
          {downloads.map((download) => (
            <DownloadRow key={download.id} download={download} onNotice={setNotice} />
          ))}
        </ul>
      )}
    </SurfaceShell>
  );
}

function DownloadRow({ download, onNotice }: { download: DownloadState; onNotice: (message: string) => void }) {
  const isActive = download.status === 'progressing' || download.status === 'paused';
  const hasKnownSize = download.totalBytes > 0;
  const percent = hasKnownSize ? Math.min(100, (download.receivedBytes / download.totalBytes) * 100) : 0;

  return (
    <li className="group flex items-center gap-4 px-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            disabled={download.status !== 'completed'}
            onClick={() =>
              void (async () => {
                const api = window.copacetic;
                if (!api) {
                  return;
                }
                const message = await api.downloads.openFile(download.id);
                if (message) {
                  onNotice(message);
                }
              })()
            }
            className={cn(
              'truncate text-left text-[13px]',
              download.status === 'completed' ? 'text-ink hover:underline' : 'cursor-default text-ink-dim',
            )}
            title={download.savePath}
          >
            {download.filename}
          </button>
          <StatusWord download={download} />
        </div>

        {isActive && (
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line">
            {hasKnownSize ? (
              <div
                className="h-full rounded-full bg-active transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div className="animate-indeterminate h-full w-full rounded-full bg-active" />
            )}
          </div>
        )}

        <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{detailLine(download)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {download.status === 'progressing' && (
          <IconButton
            label="Pause download"
            size="sm"
            onClick={() => send((api) => api.downloads.pause(download.id))}
          >
            <Pause size={13} />
          </IconButton>
        )}
        {download.status === 'paused' && (
          <IconButton
            label="Resume download"
            size="sm"
            onClick={() => send((api) => api.downloads.resume(download.id))}
          >
            <Play size={13} />
          </IconButton>
        )}
        {isActive && (
          <IconButton
            label="Cancel download"
            size="sm"
            onClick={() => send((api) => api.downloads.cancel(download.id))}
          >
            <X size={13} />
          </IconButton>
        )}
        {download.status === 'completed' && (
          <IconButton
            label="Show in folder"
            size="sm"
            onClick={() => send((api) => api.downloads.revealFile(download.id))}
          >
            <FolderOpen size={13} />
          </IconButton>
        )}
        <IconButton
          label="Remove from list"
          size="sm"
          onClick={() => send((api) => api.downloads.remove(download.id))}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
    </li>
  );
}

function StatusWord({ download }: { download: DownloadState }) {
  const styles: Record<DownloadState['status'], string> = {
    progressing: 'text-active',
    paused: 'text-caution',
    completed: 'text-clear',
    cancelled: 'text-ink-faint',
    interrupted: 'text-alert',
  };
  const words: Record<DownloadState['status'], string> = {
    progressing: 'Downloading',
    paused: 'Paused',
    completed: download.fileExists ? 'Saved' : 'Moved',
    cancelled: 'Cancelled',
    interrupted: 'Failed',
  };
  return <span className={cn('label shrink-0', styles[download.status])}>{words[download.status]}</span>;
}

function detailLine(download: DownloadState): string {
  const parts: string[] = [];

  if (download.status === 'progressing' || download.status === 'paused') {
    parts.push(
      download.totalBytes > 0
        ? `${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}`
        : formatBytes(download.receivedBytes),
    );
    const rate = formatRate(download.bytesPerSecond);
    if (rate && download.status === 'progressing') {
      parts.push(rate);
    }
    const eta = formatEta(download.receivedBytes, download.totalBytes, download.bytesPerSecond);
    if (eta && download.status === 'progressing') {
      parts.push(eta);
    }
  } else {
    parts.push(formatBytes(download.receivedBytes));
    if (download.completedAt) {
      parts.push(formatRelativeTime(download.completedAt));
    }
  }

  if (download.status === 'completed' && !download.fileExists) {
    parts.push('no longer at that path');
  }

  return parts.join(' · ');
}
