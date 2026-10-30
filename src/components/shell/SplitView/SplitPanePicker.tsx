'use client';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { TabState } from '@shared/types';

/** The open tabs this half of a split could show instead, so filling it is a click rather than a pasted address. */
export function SplitPanePicker({ paneId, candidates }: { paneId: string; candidates: TabState[] }) {
  const headingId = `split-picker-${paneId}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex max-h-[40%] flex-none flex-col gap-2 border-b border-line bg-raised px-4 py-3"
    >
      <h2 id={headingId} className="text-body-sm font-medium text-ink-dim">
        {t('shell.splitView.pickTab')}
      </h2>
      <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <button
              type="button"
              onClick={() => send((api) => api.tabs.replaceSplitPane(paneId, candidate.id))}
              className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-body-sm text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              <Favicon dataUrl={candidate.faviconDataUrl} seed={candidate.url} size={14} />
              <span className="min-w-0 flex-1 truncate">{candidate.title || candidate.url}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
