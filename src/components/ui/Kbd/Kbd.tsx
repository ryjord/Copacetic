'use client';

import { acceleratorKeys } from '@shared/shortcuts';
import { isMacPlatform } from '@/lib/platform';

/** A shortcut, printed the way this platform prints it: ⇧⌘T on a Mac, Ctrl Shift T elsewhere. */
export function Kbd({ accelerator }: { accelerator: string }) {
  const isMac = isMacPlatform();
  const keys = acceleratorKeys(accelerator, isMac);
  return (
    <kbd className="inline-flex shrink-0 items-center gap-0.5 font-sans text-body-sm text-ink-faint">
      {isMac ? (
        <span className="tracking-wide">{keys.join('')}</span>
      ) : (
        keys.map((key) => (
          <span key={key} className="rounded-xs border border-line px-1 text-caption">
            {key}
          </span>
        ))
      )}
    </kbd>
  );
}
