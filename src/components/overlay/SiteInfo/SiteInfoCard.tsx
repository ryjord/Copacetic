'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { Ban, BadgeCheck, CalendarClock, FileText, HelpCircle, Lock, ShieldOff, Timer, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge';
import { useDismissLayer } from '@/lib/dismissLayer';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

// Types
import {
  PERMISSION_LABELS,
  type CertificateSummary,
  type ConnectionEntry,
  type PermissionKind,
  type SecurityLevel,
  type TabState,
} from '@shared/types';
import { hostOf, originOf, registrableDomainOf } from '@shared/url';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'text-clear', word: 'Encrypted' },
  insecure: { icon: ShieldOff, className: 'text-caution', word: 'Not secure' },
  internal: { icon: FileText, className: 'text-ink-dim', word: 'Local' },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: 'Unknown' },
};

const close = () => send((api) => api.chrome.closeSiteInfo());

/** Everything Copacetic can honestly say about the current connection, over the page's top-left corner. */
export function SiteInfoCard({ tab }: { tab: TabState }) {
  const openedAt = useBrowserStore((state) => state.siteInfo?.openedAt ?? null);
  useDismissLayer(true, close);

  const style = LEVEL_STYLES[tab.security.level];
  const Icon = style.icon;
  const certificate = tab.security.certificate;

  return (
    <section
      aria-label="Connection details"
      className="animate-pop flex max-h-140 w-100 flex-col overflow-y-auto rounded-lg border border-line bg-raised shadow-popover"
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <Icon size={18} strokeWidth={1.75} className={cn('mt-px shrink-0', style.className)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn('text-body font-medium', style.className)}>{style.word}</p>
          <p className="mt-0.5 text-body-sm text-ink-dim">{tab.security.detail}</p>
        </div>
        <IconButton label="Close connection details" size="sm" onClick={close}>
          <X size={14} strokeWidth={1.75} />
        </IconButton>
      </div>

      <dl className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
        <Row label="Host" value={tab.security.host || 'None'} isMono />
        {tab.loadMs !== null && (
          <Row label="Load time" value={formatDuration(tab.loadMs)} icon={<Timer size={12} aria-hidden />} />
        )}
        <Row
          label="Trackers blocked"
          value={String(tab.blockedCount)}
          icon={<Ban size={12} aria-hidden />}
          isEmphasised={tab.blockedCount > 0}
        />
        {certificate && <CertificateRows certificate={certificate} now={openedAt} />}
      </dl>

      {tab.security.certificateChange && <CertificateChangeNotice detail={tab.security.certificateChange} />}
      {/* An exception is kept by site, which would be writing down a site opened in a tab that promises to keep nothing. */}
      {!tab.isHush && <TrackerException url={tab.url} blockedCount={tab.blockedCount} />}
      <SitePermissions url={tab.url} />
      {/* Keyed by tab, so a switch never shows one tab's hosts under another's heading. */}
      <ConnectionLog key={tab.id} tabId={tab.id} />
    </section>
  );
}

// Turning blocking off for one site rather than everywhere.
function TrackerException({ url, blockedCount }: { url: string; blockedCount: number }) {
  const settings = useBrowserStore((state) => state.settings);
  const site = registrableDomainOf(hostOf(url));
  if (!site || !settings.blockTrackers) {
    return null;
  }

  const isAllowed = settings.blockerAllowlist.includes(site);
  const toggle = () => {
    const next = isAllowed
      ? settings.blockerAllowlist.filter((entry) => entry !== site)
      : [...settings.blockerAllowlist, site];
    send((api) => api.settings.update({ blockerAllowlist: next }));
  };

  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3">
      <p className="min-w-0 flex-1 text-body-sm text-ink-dim">
        {isAllowed ? (
          <>
            Trackers are <span className="text-caution">allowed</span> on{' '}
            <span className="font-medium text-ink">{site}</span>.
          </>
        ) : (
          <>
            Trackers are blocked on <span className="font-medium text-ink">{site}</span>
            {blockedCount > 0 && <span className="text-ink-faint">, {blockedCount} stopped on this page</span>}.
          </>
        )}
      </p>
      <Button size="sm" onClick={toggle}>
        {isAllowed ? 'Block again' : 'Allow on this site'}
      </Button>
    </div>
  );
}

// What this site has already been allowed, or refused, to do.
function SitePermissions({ url }: { url: string }) {
  const decisions = useBrowserStore((state) => state.settings.permissionDecisions);
  const origin = originOf(url);
  if (!origin) {
    return null;
  }

  const granted = Object.entries(decisions)
    .map(([key, decision]) => {
      const separator = key.lastIndexOf('|');
      return { origin: key.slice(0, separator), kind: key.slice(separator + 1) as PermissionKind, decision };
    })
    .filter((entry) => entry.origin === origin);

  if (granted.length === 0) {
    return (
      <p className="border-t border-line px-4 py-3 text-body-sm text-ink-faint">
        This site has not asked for anything that needed your permission.
      </p>
    );
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <h2 className="label mb-2">This site can</h2>
      <ul className="flex flex-col">
        {granted.map((entry) => (
          <li key={entry.kind} className="flex h-8 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
              {PERMISSION_LABELS[entry.kind] ?? entry.kind}
            </span>
            <span
              className={cn('shrink-0 text-body-sm', entry.decision === 'allow' ? 'text-clear' : 'text-ink-faint')}
            >
              {entry.decision === 'allow' ? 'Allowed' : 'Blocked'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => send((api) => api.permissions.forget(origin, entry.kind))}
            >
              Reset
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Every host the page has actually talked to.
function ConnectionLog({ tabId }: { tabId: string }) {
  const [entries, setEntries] = useState<ConnectionEntry[] | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void ask((api) => api.connections.list(tabId), []).then((result) => {
      if (isCurrent) {
        setEntries(result);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [tabId]);

  if (entries === null) {
    return null;
  }

  if (entries.length === 0) {
    return (
      <p className="border-t border-line px-4 py-3 text-body-sm text-ink-faint">
        No requests recorded for this page yet.
      </p>
    );
  }

  const blockedHosts = entries.filter((entry) => entry.blocked > 0).length;
  const visible = isExpanded ? entries : entries.slice(0, 6);

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="label">Hosts contacted</h2>
        <p className="text-caption text-ink-faint">
          {entries.length} host{entries.length === 1 ? '' : 's'}
          {blockedHosts > 0 && <span className="text-caution"> · {blockedHosts} blocked</span>}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {visible.map((entry) => (
          <li key={entry.host} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-ink-dim select-text">
                {entry.host}
              </span>
              {entry.blocked > 0 ? (
                <span className="shrink-0 text-caption text-caution">Blocked {entry.blocked}</span>
              ) : (
                entry.isTracker && <span className="shrink-0 text-caption text-ink-faint">Allowed</span>
              )}
              <span className="w-6 shrink-0 text-right text-caption text-ink-faint tabular-nums">
                {entry.requests}
              </span>
            </div>
            {/* Which of the two stopped it: a rule can be wrong about one URL, a hostname about a whole company. */}
            {entry.blocked > 0 && (
              <span className="truncate font-mono text-caption text-ink-faint" title={entry.rule ?? undefined}>
                {entry.rule ? `by rule ${entry.rule}` : 'by hostname'}
              </span>
            )}
          </li>
        ))}
      </ul>
      {entries.length > visible.length && (
        <Button size="sm" variant="ghost" className="mt-2 -ml-2.5" onClick={() => setIsExpanded(true)}>
          Show all {entries.length}
        </Button>
      )}
    </div>
  );
}

/** Copacetic remembers every certificate it saw, which is what lets it say a site is presenting a different one. */
function CertificateChangeNotice({ detail }: { detail: string }) {
  return (
    <div className="mx-4 mb-3 rounded-md border border-caution/40 px-3 py-2" role="status">
      <h3 className="mb-1 text-body-sm font-medium text-caution">This certificate has changed</h3>
      <p className="text-body-sm text-ink-dim">{detail}</p>
    </div>
  );
}

function CertificateRows({ certificate, now }: { certificate: CertificateSummary; now: number | null }) {
  const daysLeft = now === null ? null : Math.floor((certificate.validTo - now) / 86_400_000);
  const isExpiringSoon = daysLeft !== null && daysLeft <= 14;

  return (
    <>
      <Row
        label="Issued by"
        value={certificate.issuer}
        icon={<BadgeCheck size={12} aria-hidden />}
        isWarning={!certificate.isIssuedByKnownRoot}
      />
      {!certificate.isIssuedByKnownRoot && (
        <p className="text-body-sm text-caution">
          This certificate chains to a root installed on this machine, not one your system shipped with. Something
          local, such as a company proxy, antivirus or a debugging tool, is reading this connection.
        </p>
      )}
      {certificate.subject && <Row label="Issued to" value={certificate.subject} isMono />}
      <Row
        label="Expires"
        value={formatExpiry(certificate.validTo, daysLeft)}
        icon={<CalendarClock size={12} aria-hidden />}
        isWarning={isExpiringSoon}
      />
    </>
  );
}

export function formatExpiry(validTo: number, daysLeft: number | null): string {
  if (!validTo) {
    return 'Unknown';
  }
  const date = new Date(validTo).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (daysLeft === null) {
    return date;
  }
  if (daysLeft < 0) {
    return `${date}, expired`;
  }
  if (daysLeft === 0) {
    return `${date}, today`;
  }
  if (daysLeft <= 90) {
    return `${date}, in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  }
  return date;
}

interface RowProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  isMono?: boolean;
  isEmphasised?: boolean;
  isWarning?: boolean;
}

function Row({ label, value, icon, isMono, isEmphasised, isWarning }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex shrink-0 items-center gap-1.5 text-body-sm text-ink-faint">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          'min-w-0 truncate text-body-sm select-text',
          isMono && 'font-mono',
          isWarning ? 'text-caution' : isEmphasised ? 'text-clear' : 'text-ink-dim',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
