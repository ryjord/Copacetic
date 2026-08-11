'use client';

import { FileText, HelpCircle, Lock, ShieldOff } from 'lucide-react';
import type { SecurityLevel, TabState } from '../../../electron/shared/types';
import { cn } from '@/lib/utils';
import { useBrowserStore } from '@/store/useBrowserStore';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'text-clear', word: 'Encrypted' },
  insecure: { icon: ShieldOff, className: 'text-caution', word: 'Not secure' },
  internal: { icon: FileText, className: 'text-ink-dim', word: 'Local' },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: 'Unknown' },
};

/**
 * The one badge in the chrome that is allowed to be coloured, because it is the
 * only one reporting something the user cannot otherwise see.
 *
 * The browser this replaced showed a hardcoded "SECURE" label on every page,
 * including plain http. That is worse than showing nothing, so this reads the
 * real scheme and says "Not secure" when that is the truth.
 *
 * The detail it opens is `ConnectionPanel`, which is rendered as part of the
 * chrome column rather than here as a popover. A native view always paints
 * above the renderer's HTML, so a popover hanging below the toolbar would be
 * hidden behind the page on every site that actually loaded one.
 */
export function ConnectionBadge({ tab }: { tab: TabState | null }) {
  const isOpen = useBrowserStore((state) => state.isConnectionPanelOpen);
  const togglePanel = useBrowserStore((state) => state.toggleConnectionPanel);

  if (!tab || tab.isStartPage) {
    return <Lock size={12} className="shrink-0 text-ink-faint/50" aria-hidden />;
  }

  const style = LEVEL_STYLES[tab.security.level];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={togglePanel}
      aria-label={`Connection: ${style.word}. Show details`}
      aria-expanded={isOpen}
      aria-controls="connection-panel"
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-line-strong',
        style.className,
      )}
    >
      <Icon size={12} />
      {tab.security.level === 'insecure' && <span className="label text-caution">Not secure</span>}
    </button>
  );
}
