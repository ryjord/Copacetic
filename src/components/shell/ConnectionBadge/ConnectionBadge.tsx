'use client';

// Icons
import { FileText, HelpCircle, Lock, Search, ShieldOff } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { SecurityLevel, TabState } from '@shared/types';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'text-clear', word: t('shell.securityLevel.secure') },
  insecure: { icon: ShieldOff, className: 'text-caution', word: t('shell.securityLevel.insecure') },
  internal: { icon: FileText, className: 'text-ink-dim', word: t('shell.securityLevel.internal') },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: t('shell.securityLevel.unknown') },
};

/** The one badge in the chrome that is allowed to be coloured, because it is the only one reporting something the user cannot otherwise see. */
export function ConnectionBadge({ tab }: { tab: TabState | null }) {
  const openTabId = useBrowserStore((state) => state.siteInfo?.tabId ?? null);

  if (!tab || tab.isStartPage) {
    // Nothing has been loaded yet, so there is no connection to vouch for.
    return <Search size={14} strokeWidth={1.75} className="shrink-0 text-ink-faint" aria-hidden />;
  }

  const style = LEVEL_STYLES[tab.security.level];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={() => send((api) => api.chrome.toggleSiteInfo())}
      aria-label={t('shell.connectionBadge.label', { level: style.word })}
      aria-expanded={openTabId === tab.id}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-line-strong',
        style.className,
      )}
    >
      <Icon size={12} />
      {tab.security.level === 'insecure' && <span className="label text-caution">{style.word}</span>}
    </button>
  );
}
