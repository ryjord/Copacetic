'use client';

import { Ban, BadgeCheck, CalendarClock, FileText, HelpCircle, Lock, ShieldOff, Timer, X } from 'lucide-react';
import type { CertificateSummary, SecurityLevel, TabState } from '../../../electron/shared/types';
import { IconButton } from '@/components/ui/IconButton';
import { useDismissLayer } from '@/lib/dismissLayer';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBrowserStore } from '@/store/useBrowserStore';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'text-clear', word: 'Encrypted' },
  insecure: { icon: ShieldOff, className: 'text-caution', word: 'Not secure' },
  internal: { icon: FileText, className: 'text-ink-dim', word: 'Local' },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: 'Unknown' },
};

/**
 * Everything Copacetic can honestly say about the current connection.
 *
 * This is part of the chrome column rather than a popover floating over the
 * page, for the same reason the address-bar suggestions and the find bar are:
 * a native view always paints above the renderer's HTML, so anything
 * overlapping the content area is simply invisible. The page is pushed down to
 * make room instead.
 */
export function ConnectionPanel({ tab }: { tab: TabState | null }) {
  const closePanel = useBrowserStore((state) => state.closeConnectionPanel);
  // Stamped by the action that opened the panel. Reading the clock is a side
  // effect, so it happens in the click that caused it, never during render.
  const openedAt = useBrowserStore((state) => state.connectionPanelOpenedAt);

  useDismissLayer(true, closePanel);

  if (!tab) return null;

  const style = LEVEL_STYLES[tab.security.level];
  const Icon = style.icon;
  const certificate = tab.security.certificate;

  return (
    <section
      className="animate-fade shrink-0 border-b border-line bg-raised px-3 py-3"
      aria-label="Connection details"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start gap-2">
          <Icon size={14} className={cn('mt-0.5 shrink-0', style.className)} />
          <div className="min-w-0 flex-1">
            <p className={cn('text-[13px] font-medium', style.className)}>{style.word}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">{tab.security.detail}</p>
          </div>
          <IconButton label="Close connection details" onClick={closePanel}>
            <X size={14} />
          </IconButton>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 border-t border-line pt-3 sm:grid-cols-2">
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
          {certificate && <CertificateRows certificate={certificate} now={openedAt} />}
        </dl>
      </div>
    </section>
  );
}

/**
 * What Chromium validated, reported rather than re-derived.
 *
 * The wording stays inside the claim the README makes: who issued it and when
 * it stops being valid, not a verdict Copacetic has not earned. Expiry is the
 * one field allowed colour, because a certificate days from expiring is state
 * a user cannot see any other way.
 */
function CertificateRows({ certificate, now }: { certificate: CertificateSummary; now: number | null }) {
  const daysLeft = now === null ? null : Math.floor((certificate.validTo - now) / 86_400_000);
  const expiringSoon = daysLeft !== null && daysLeft <= 14;

  return (
    <>
      <Row label="Issued by" value={certificate.issuer} icon={<BadgeCheck size={11} />} />
      {certificate.subject && <Row label="Issued to" value={certificate.subject} mono />}
      <div className="flex items-center justify-between gap-4">
        <dt className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <CalendarClock size={11} />
          Expires
        </dt>
        <dd className={cn('truncate text-[11.5px]', expiringSoon ? 'text-caution' : 'text-ink-dim')}>
          {formatExpiry(certificate.validTo, daysLeft)}
        </dd>
      </div>
    </>
  );
}

export function formatExpiry(validTo: number, daysLeft: number | null): string {
  if (!validTo) return 'Unknown';
  const date = new Date(validTo).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (daysLeft === null) return date;
  if (daysLeft < 0) return `${date} — expired`;
  if (daysLeft === 0) return `${date} — today`;
  if (daysLeft <= 90) return `${date} — ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  return date;
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
