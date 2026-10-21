'use client';

// Libs
import { useState } from 'react';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { useExtensions } from '@/lib/extensions/useExtensions';
import { cn } from '@/lib/utils';
import { webStoreIdFrom } from '@shared/extensions/extensions';
import { t } from '@shared/i18n/translate';

// Types
import type { TabState } from '@shared/types';

interface Attempt {
  id: string;
  isAdding: boolean;
  problem: string;
}

function labelFor(attempt: Attempt | null): string {
  if (attempt?.isAdding) {
    return t('shell.omnibox.addingExtension');
  }
  return attempt?.problem ? t('shell.omnibox.retryExtension') : t('shell.omnibox.addExtension');
}

/**
 * The store's own button says to switch to Chrome, and nothing of Copacetic's
 * runs in the store's page, so its address bar offers the extension instead.
 */
export function AddToCopacetic({ tab }: { tab: TabState }) {
  const id = tab.isHush ? null : webStoreIdFrom(tab.url);
  const extensions = useExtensions(id !== null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  if (id === null) {
    return null;
  }
  if (extensions?.some((extension) => extension.id === id)) {
    return <span className="shrink-0 px-2 text-body-sm text-ink-dim">{t('shell.omnibox.extensionAdded')}</span>;
  }
  const current = attempt?.id === id ? attempt : null;
  const add = async () => {
    setAttempt({ id, isAdding: true, problem: '' });
    const problem = await ask((api) => api.extensions.addFromWebStore(id), '');
    setAttempt({ id, isAdding: false, problem });
  };
  return (
    <>
      <button
        type="button"
        disabled={current?.isAdding}
        title={current?.problem || undefined}
        onClick={() => void add()}
        className={cn(
          'no-drag flex h-6 shrink-0 items-center rounded-sm px-2 text-body-sm font-medium transition-colors',
          'disabled:pointer-events-none disabled:opacity-60',
          current?.problem ? 'text-alert hover:bg-alert/8' : 'bg-accent text-accent-ink hover:opacity-90',
        )}
      >
        {labelFor(current)}
      </button>
      {current?.problem && (
        <span role="status" className="sr-only">
          {t('shell.omnibox.extensionNotAdded', { problem: current.problem })}
        </span>
      )}
    </>
  );
}
