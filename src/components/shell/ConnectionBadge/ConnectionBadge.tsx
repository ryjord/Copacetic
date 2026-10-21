'use client';

// Icons
import { FileText, HelpCircle, Lock, Search, ShieldOff } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { SecurityLevel, TabState } from '@shared/types';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'bg-clear/12 text-clear', word: t('shell.securityLevel.secure') },
  insecure: { icon: ShieldOff, className: 'bg-caution/12 text-caution', word: t('shell.securityLevel.insecure') },
  internal: { icon: FileText, className: 'text-ink-dim', word: t('shell.securityLevel.internal') },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: t('shell.securityLevel.unknown') },
};

/** The one badge in the chrome that is allowed to be coloured, because it is the only one reporting something the user cannot otherwise see. */
export function ConnectionBadge({ tab }: { tab: TabState | null }) {
  const openTabId = useBrowserStore((state) => state.siteInfo?.tabId ?? null);

  if (!tab || tab.internalPage === 'start') {
    // Nothing has been loaded yet, so there is no connection to vouch for.
    return <Search size={14} strokeWidth={1.75} className="ml-1.5 shrink-0 text-ink-faint" aria-hidden />;
  }
  if (tab.internalPage !== null) {
    // One of our own pages: nothing came over a connection, so there is no card to open.
    return <FileText size={14} strokeWidth={1.75} className="ml-1.5 shrink-0 text-ink-dim" aria-hidden />;
  }

  const style = LEVEL_STYLES[tab.security.level];
  const Icon = style.icon;
  const blocked = tab.blockedCount;

  return (
    <button
      type="button"
      onClick={() => send((api) => api.chrome.toggleSiteInfo())}
      aria-label={
        blocked > 0
          ? t('shell.connectionBadge.labelBlocked', { level: style.word, count: blocked })
          : t('shell.connectionBadge.label', { level: style.word })
      }
      aria-expanded={openTabId === tab.id}
      className={cn(
        'flex h-6 shrink-0 items-center gap-1.5 rounded-[7px] px-2 text-body-sm whitespace-nowrap transition-[filter] hover:brightness-125',
        style.className,
      )}
    >
      <Icon size={12} />
      {tab.security.level === 'insecure' && <span>{style.word}</span>}
      {blocked > 0 && <span>{t('shell.connectionBadge.blocked', { count: blocked })}</span>}
    </button>
  );
}
