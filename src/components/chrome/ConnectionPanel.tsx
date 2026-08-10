'use client';

import { Ban, BadgeCheck, CalendarClock, FileText, HelpCircle, Lock, ShieldOff, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CertificateSummary, ConnectionEntry, SecurityLevel, TabState } from '../../../electron/shared/types';
import { IconButton } from '@/components/ui/IconButton';
import { ask } from '@/lib/bridge';
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

        <ConnectionLog tabId={tab.id} />
      </div>
    </section>
  );
}

/**
 * Every host the page has actually talked to.
 *
 * The blocked count says what was stopped. This is the other half: what was
 * allowed through. No mainstream browser shows that without opening developer
 * tools, and it is the most direct answer this product can give to "what is
 * this page doing behind my back".
 */
function ConnectionLog({ tabId }: { tabId: string }) {
  const [entries, setEntries] = useState<ConnectionEntry[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ask((api) => api.connections.list(tabId), []).then((result) => {
      if (!cancelled) setEntries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  if (entries === null) return null;

  if (entries.length === 0) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-faint">
        No requests recorded for this page yet.
      </p>
    );
  }

  const blockedHosts = entries.filter((entry) => entry.blocked > 0).length;
  const visible = expanded ? entries : entries.slice(0, 6);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="label">Hosts contacted</h2>
        <p className="text-[11px] text-ink-faint">
          {entries.length} host{entries.length === 1 ? '' : 's'}
          {blockedHosts > 0 && <span className="text-caution"> · {blockedHosts} blocked</span>}
        </p>
      </div>

      <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-field border border-line">
        {visible.map((entry) => (
          <li key={entry.host} className="flex items-center gap-3 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-dim">{entry.host}</span>
            {entry.blocked > 0 ? (
              <span className="label shrink-0 text-caution">Blocked {entry.blocked}</span>
            ) : (
              entry.isTracker && <span className="label shrink-0 text-ink-faint">Allowed</span>
            )}
            <span className="shrink-0 font-mono text-[11px] text-ink-faint">{entry.requests}</span>
          </li>
        ))}
      </ul>

      {entries.length > visible.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
        >
          Show all {entries.length}
        </button>
      )}
    </div>
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
