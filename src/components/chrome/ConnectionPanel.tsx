'use client';

import { Ban, BadgeCheck, CalendarClock, FileText, HelpCircle, Lock, ShieldOff, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  PERMISSION_LABELS,
  type CertificateSummary,
  type ConnectionEntry,
  type PermissionKind,
  type SecurityLevel,
  type TabState,
} from '../../../electron/shared/types';
import { hostOf, originOf, registrableDomainOf } from '../../../electron/shared/url';
import { IconButton } from '@/components/ui/IconButton';
import { ask, send } from '@/lib/bridge';
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

/** Everything Copacetic can honestly say about the current connection. */
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
      id="connection-panel"
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

        {/*
          Keyed by tab so a switch produces a fresh instance rather than
          briefly showing one tab's hosts under another tab's heading. Cheaper
          to reason about than resetting state on a change.
        */}
        <TrackerException url={tab.url} blockedCount={tab.blockedCount} />

        <SitePermissions url={tab.url} />

        <ConnectionLog key={tab.id} tabId={tab.id} />
      </div>
    </section>
  );
}

// Turning blocking off for one site rather than everywhere.
function TrackerException({ url, blockedCount }: { url: string; blockedCount: number }) {
  const settings = useBrowserStore((state) => state.settings);
  const site = registrableDomainOf(hostOf(url));
  if (!site || !settings.blockTrackers) return null;

  const allowed = settings.blockerAllowlist.includes(site);
  const toggle = () => {
    const next = allowed
      ? settings.blockerAllowlist.filter((entry) => entry !== site)
      : [...settings.blockerAllowlist, site];
    send((api) => api.settings.update({ blockerAllowlist: next }));
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3">
      <p className="min-w-0 flex-1 text-[12px] text-ink-dim">
        {allowed ? (
          <>
            Trackers are <span className="text-caution">allowed</span> on{' '}
            <span className="font-mono text-ink">{site}</span>.
          </>
        ) : (
          <>
            Trackers are blocked on <span className="font-mono text-ink">{site}</span>
            {blockedCount > 0 && <span className="text-ink-faint"> — {blockedCount} stopped on this page</span>}.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={toggle}
        className="shrink-0 rounded-field border border-line px-2.5 py-1 text-[11.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
      >
        {allowed ? 'Block again' : 'Allow on this site'}
      </button>
    </div>
  );
}

// What this site has already been allowed, or refused, to do.
function SitePermissions({ url }: { url: string }) {
  const decisions = useBrowserStore((state) => state.settings.permissionDecisions);
  const origin = originOf(url);
  if (!origin) return null;

  const granted = Object.entries(decisions)
    .map(([key, decision]) => {
      const separator = key.lastIndexOf('|');
      return { origin: key.slice(0, separator), kind: key.slice(separator + 1) as PermissionKind, decision };
    })
    .filter((entry) => entry.origin === origin);

  if (granted.length === 0) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-faint">
        This site has not asked for anything that needed your permission.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <h2 className="label mb-2">This site can</h2>
      <ul className="divide-y divide-line rounded-field border border-line">
        {granted.map((entry) => (
          <li key={entry.kind} className="flex items-center gap-3 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-dim">
              {PERMISSION_LABELS[entry.kind] ?? entry.kind}
            </span>
            <span className={cn('label shrink-0', entry.decision === 'allow' ? 'text-clear' : 'text-ink-faint')}>
              {entry.decision === 'allow' ? 'Allowed' : 'Blocked'}
            </span>
            <button
              type="button"
              onClick={() => send((api) => api.permissions.forget(origin, entry.kind))}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
            >
              Reset
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Every host the page has actually talked to.
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

  const blockedHosts = entries.reduce((total, entry) => total + (entry.blocked > 0 ? 1 : 0), 0);
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

// What Chromium validated, reported rather than re-derived.
function CertificateRows({ certificate, now }: { certificate: CertificateSummary; now: number | null }) {
  const daysLeft = now === null ? null : Math.floor((certificate.validTo - now) / 86_400_000);
  const expiringSoon = daysLeft !== null && daysLeft <= 14;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <dt className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <BadgeCheck size={11} />
          Issued by
        </dt>
        <dd
          className={cn('truncate text-[11.5px]', certificate.isIssuedByKnownRoot ? 'text-ink-dim' : 'text-caution')}
        >
          {certificate.issuer}
        </dd>
      </div>
      {!certificate.isIssuedByKnownRoot && (
        <p className="text-[11.5px] leading-relaxed text-caution sm:col-span-2">
          This certificate chains to a root installed on this machine, not one your system shipped with. Something
          local — a company proxy, antivirus, or a debugging tool — is reading this connection.
        </p>
      )}
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
