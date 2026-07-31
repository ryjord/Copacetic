'use client';

import { FileText, Lock, ShieldOff, Ban, Timer, HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SecurityLevel, TabState } from '../../../electron/shared/types';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'text-clear', word: 'Encrypted' },
  insecure: { icon: ShieldOff, className: 'text-caution', word: 'Not secure' },
  internal: { icon: FileText, className: 'text-ink-dim', word: 'Local' },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: 'Unknown' },
};

/**
 * The one badge in the chrome that is allowed to be coloured, because it is
 * the only one reporting something the user cannot otherwise see.
 *
 * The browser this replaced showed a hardcoded "SECURE" label on every page,
 * including plain http. That is worse than showing nothing, so this reads the
 * real scheme and says "Not secure" when that is the truth.
 */
export function ConnectionBadge({ tab }: { tab: TabState | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen]);

  if (!tab || tab.isStartPage) {
    return <Lock size={12} className="shrink-0 text-ink-faint/50" aria-hidden />;
  }

  const style = LEVEL_STYLES[tab.security.level];
  const Icon = style.icon;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={`Connection: ${style.word}. Show details`}
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-line-strong',
          style.className,
        )}
      >
        <Icon size={12} />
        {tab.security.level === 'insecure' && <span className="label text-caution">Not secure</span>}
      </button>

      {isOpen && (
        <div className="animate-rise absolute left-0 top-[calc(100%+8px)] z-50 w-80 rounded-panel border border-line bg-raised p-4 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.8)]">
          <div className="flex items-center gap-2">
            <Icon size={14} className={style.className} />
            <span className={cn('text-[13px] font-medium', style.className)}>{style.word}</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{tab.security.detail}</p>

          <dl className="mt-3 space-y-1.5 border-t border-line pt-3">
            <Row label="Host" value={tab.security.host || '—'} mono />
            {tab.loadMs !== null && (
              <Row label="Load time" value={formatDuration(tab.loadMs)} mono icon={<Timer size={11} />} />
            )}
            <Row
              label="Trackers blocked"
              value={String(tab.blockedCount)}
              mono
              icon={<Ban size={11} />}
              emphasise={tab.blockedCount > 0}
            />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  icon,
  emphasise,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
  emphasise?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        {icon}
        {label}
      </dt>
      <dd className={cn('truncate text-[11.5px]', mono && 'font-mono', emphasise ? 'text-clear' : 'text-ink-dim')}>
        {value}
      </dd>
    </div>
  );
}
