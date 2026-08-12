'use client';

import { RotateCw } from 'lucide-react';
import type { PageError } from '../../../electron/shared/types';
import { send } from '@/lib/bridge';

/** Error copy states what happened and what to do, and shows the symbolic code so it can be searched for. */
export function ErrorPage({ tabId, error }: { tabId: string; error: PageError }) {
  const isCertificateProblem = error.name.startsWith('ERR_CERT');

  return (
    <div className="ambient-field flex h-full w-full items-center justify-center overflow-y-auto px-8">
      <div className="w-full max-w-md">
        <span className={`label ${isCertificateProblem ? 'text-alert' : 'text-caution'}`}>
          {isCertificateProblem ? 'Connection not trusted' : 'Did not load'}
        </span>

        <h1 className="mt-3 text-[22px] font-normal leading-snug text-ink">{headlineFor(error)}</h1>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">{error.description}</p>

        <p className="mt-5 break-all font-mono text-[11.5px] text-ink-faint">{error.url}</p>

        <div className="mt-6 flex items-center gap-3">
          {!isCertificateProblem && (
            <button
              type="button"
              onClick={() => send((api) => api.tabs.reload(tabId))}
              className="flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-hover"
            >
              <RotateCw size={13} />
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={() => send((api) => api.tabs.navigate(tabId, 'copacetic://start'))}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
          >
            Back to start
          </button>
          <code className="ml-auto font-mono text-[11px] text-ink-faint">{error.name}</code>
        </div>
      </div>
    </div>
  );
}

function headlineFor(error: PageError): string {
  if (error.name.startsWith('RENDERER_')) {
    return 'This page stopped responding';
  }
  if (error.name.startsWith('ERR_CERT')) {
    return 'Copacetic could not verify this site';
  }
  return 'This page did not load';
}
