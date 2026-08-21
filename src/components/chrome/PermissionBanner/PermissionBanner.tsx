'use client';

import { useState } from 'react';
import type { PermissionPrompt } from '@shared/types';
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

/** Sites ask for capabilities through this, and only this. */
export function PermissionBanner({ prompt }: { prompt: PermissionPrompt }) {
  const [remember, setRemember] = useState(true);
  const host = hostFrom(prompt.origin);

  const respond = (decision: 'allow' | 'deny') => {
    send((api) => api.permissions.respond(prompt.id, decision, remember));
  };

  return (
    <div className="animate-rise flex items-center gap-3 border-t border-line bg-raised px-3 py-2">
      <p className="min-w-0 flex-1 text-[12.5px] text-ink">
        <span className="font-mono text-ink">{host}</span>
        <span className="text-ink-dim"> wants to {prompt.description}.</span>
      </p>

      <label className="flex cursor-default select-none items-center gap-1.5 text-[11.5px] text-ink-dim">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="size-3.5 accent-[var(--color-active)]"
        />
        Remember this
      </label>

      <button
        type="button"
        onClick={() => respond('deny')}
        className="rounded-md px-2.5 py-1 text-[12px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
      >
        Block
      </button>
      <button
        type="button"
        onClick={() => respond('allow')}
        className={cn(
          'rounded-md border border-line-strong px-2.5 py-1 text-[12px] text-ink',
          'transition-colors hover:bg-hover',
        )}
      >
        Allow
      </button>
    </div>
  );
}

function hostFrom(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
