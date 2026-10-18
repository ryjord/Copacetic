'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { PageError } from '@shared/types';
import { send } from '@/lib/bridge';

/** Error copy states what happened and what to do, and shows the symbolic code so it can be searched for. */
export function ErrorPage({ tabId, error }: { tabId: string; error: PageError }) {
  const isCertificateProblem = error.name.startsWith('ERR_CERT');
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const host = hostFrom(error.url);

  return (
    <div className="ambient-field flex h-full w-full items-center justify-center overflow-y-auto px-8">
      <div className="w-full max-w-md">
        <span className={`label ${isCertificateProblem ? 'text-alert' : 'text-caution'}`}>
          {isCertificateProblem ? 'Connection not trusted' : 'Did not load'}
        </span>

        <h1 className="mt-3 text-[22px] font-normal leading-snug text-ink">{headlineFor(error)}</h1>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">{error.description}</p>

        <p className="mt-5 break-all font-mono text-[11.5px] text-ink-faint">{error.url}</p>

        {isCertificateProblem && !error.canAcceptCertificate && (
          <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
            Copacetic will not open this site with this certificate.
          </p>
        )}

        {error.canAcceptCertificate && isShowingDetails && (
          <div className="mt-4 rounded-md border border-line-strong p-3 text-[13px] leading-relaxed text-ink-dim">
            <p>
              If you continue, this certificate is accepted for {host} until Copacetic closes. Anyone able to
              intercept the connection could read or change what you send.
            </p>
            <button
              type="button"
              onClick={() => send((api) => api.tabs.acceptCertificate(tabId))}
              className="mt-3 rounded-md px-3 py-1.5 text-[12.5px] text-alert transition-colors hover:bg-hover"
            >
              Continue to {host}
            </button>
          </div>
        )}

        {error.plainUrl && (
          <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
            This site did not answer over HTTPS. The HTTP version is not encrypted, so anyone on your network can read
            or change it.
          </p>
        )}

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
          {error.plainUrl && (
            <button
              type="button"
              onClick={() => send((api) => api.tabs.continueOverHttp(tabId))}
              className="rounded-md px-3 py-1.5 text-[12.5px] text-caution transition-colors hover:bg-hover"
            >
              Continue over HTTP
            </button>
          )}
          {error.canAcceptCertificate && !isShowingDetails && (
            <button
              type="button"
              onClick={() => setIsShowingDetails(true)}
              className="rounded-md px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              Details
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

function hostFrom(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
