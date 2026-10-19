'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';

// Icons
import { ChevronDown, CloudOff, RotateCw, ShieldAlert, TriangleAlert } from 'lucide-react';

// Utils
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { PageError } from '@shared/types';

/** What happened, what to do about it, and the symbolic code behind Technical details for anyone searching. */
export function ErrorPage({ tabId, error }: { tabId: string; error: PageError }) {
  const isCertificateProblem = error.name.startsWith('ERR_CERT');
  const isCrash = error.name.startsWith('RENDERER_');
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const host = hostFrom(error.url);
  const Icon = isCertificateProblem ? ShieldAlert : isCrash ? TriangleAlert : CloudOff;

  return (
    <div className="ambient-field flex h-full w-full items-center justify-center overflow-y-auto px-8 py-12">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Icon
          size={28}
          strokeWidth={1.5}
          className={isCertificateProblem ? 'text-alert' : 'text-ink-faint'}
          aria-hidden
        />
        <h1 className="text-heading font-normal text-ink">{headlineFor(error)}</h1>
        <p className="text-body text-ink-dim">{error.description}</p>
        {isCertificateProblem && !error.canAcceptCertificate && (
          <p className="text-body text-ink-dim">Copacetic will not open this site with this certificate.</p>
        )}
        {error.plainUrl && (
          <p className="text-body text-ink-dim">
            This site did not answer over HTTPS. The HTTP version is not encrypted, so anyone on your network can read
            or change it.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!isCertificateProblem && (
            <Button variant="primary" onClick={() => send((api) => api.tabs.reload(tabId))}>
              <RotateCw size={14} aria-hidden />
              Try again
            </Button>
          )}
          {error.plainUrl && (
            <Button variant="danger" onClick={() => send((api) => api.tabs.continueOverHttp(tabId))}>
              Continue over HTTP
            </Button>
          )}
          <Button
            variant={isCertificateProblem ? 'primary' : 'ghost'}
            onClick={() => send((api) => api.tabs.navigate(tabId, 'copacetic://start'))}
          >
            Back to start
          </Button>
        </div>
        <div className="mt-2 border-t border-line pt-3">
          <button
            type="button"
            aria-expanded={isShowingDetails}
            onClick={() => setIsShowingDetails((shown) => !shown)}
            className="flex items-center gap-1.5 text-body-sm text-ink-dim hover:text-ink"
          >
            <ChevronDown
              size={14}
              className={cn('transition-transform', !isShowingDetails && '-rotate-90')}
              aria-hidden
            />
            Technical details
          </button>
          {isShowingDetails && (
            <div className="mt-3 flex flex-col gap-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
                <dt className="text-ink-faint">Error</dt>
                <dd className="min-w-0 font-mono text-ink-dim select-text">{error.name}</dd>
                <dt className="text-ink-faint">Address</dt>
                <dd className="min-w-0 break-all font-mono text-ink-dim select-text">{error.url}</dd>
              </dl>
              {/* Behind the disclosure on purpose: the way past a refused certificate should take a deliberate step. */}
              {error.canAcceptCertificate && (
                <div className="flex flex-col items-start gap-3 rounded-md border border-line-strong p-3">
                  <p className="text-body-sm text-ink-dim">
                    If you continue, this certificate is accepted for {host} until Copacetic closes. Anyone able to
                    intercept the connection could read or change what you send.
                  </p>
                  <Button size="sm" variant="danger" onClick={() => send((api) => api.tabs.acceptCertificate(tabId))}>
                    Continue to {host}
                  </Button>
                </div>
              )}
            </div>
          )}
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
