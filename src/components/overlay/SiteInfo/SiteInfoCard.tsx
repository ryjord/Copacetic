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
import { ask, send } from '@/lib/bridge/bridge';
import { useDismissLayer } from '@/lib/layers/dismissLayer';
import { formatDuration } from '@/lib/text/format';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import {
  PERMISSION_LABELS,
  type CertificateSummary,
  type ConnectionEntry,
  type PermissionKind,
  type SecurityLevel,
  type TabState,
} from '@shared/types';
import { hostOf, originOf, registrableDomainOf } from '@shared/browsing/url';

const LEVEL_STYLES: Record<SecurityLevel, { icon: typeof Lock; className: string; word: string }> = {
  secure: { icon: Lock, className: 'text-clear', word: t('shell.securityLevel.secure') },
  insecure: { icon: ShieldOff, className: 'text-caution', word: t('shell.securityLevel.insecure') },
  internal: { icon: FileText, className: 'text-ink-dim', word: t('shell.securityLevel.internal') },
  unknown: { icon: HelpCircle, className: 'text-ink-faint', word: t('shell.securityLevel.unknown') },
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
      aria-label={t('shell.overlay.siteInfo.label')}
      className="animate-pop flex max-h-140 w-100 flex-col overflow-y-auto rounded-lg border border-line bg-raised shadow-popover"
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <Icon size={18} strokeWidth={1.75} className={cn('mt-px shrink-0', style.className)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn('text-body font-medium', style.className)}>{style.word}</p>
          <p className="mt-0.5 text-body-sm text-ink-dim">{tab.security.detail}</p>
        </div>
        <IconButton label={t('shell.overlay.siteInfo.close')} size="sm" onClick={close}>
          <X size={14} strokeWidth={1.75} />
        </IconButton>
      </div>

      <dl className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
        <Row
          label={t('shell.overlay.siteInfo.host')}
          value={tab.security.host || t('shell.overlay.siteInfo.none')}
          isMono
        />
        {tab.loadMs !== null && (
          <Row
            label={t('shell.overlay.siteInfo.loadTime')}
            value={formatDuration(tab.loadMs)}
            icon={<Timer size={12} aria-hidden />}
          />
        )}
        <Row
          label={t('shell.overlay.siteInfo.trackersBlocked')}
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
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <Button size="sm" variant="ghost" onClick={() => send((api) => api.chrome.openSettingsPane('sites'))}>
          {t('shell.overlay.siteInfo.siteSettings')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => send((api) => api.chrome.openSettingsPane('transparency'))}>
          {t('shell.overlay.siteInfo.whatItSends')}
        </Button>
      </div>
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
            {t('shell.overlay.siteInfo.allowedLead')}{' '}
            <span className="text-caution">{t('shell.overlay.siteInfo.allowedWord')}</span>{' '}
            {t('shell.overlay.siteInfo.allowedJoin')} <span className="font-medium text-ink">{site}</span>.
          </>
        ) : (
          <>
            {t('shell.overlay.siteInfo.blockedLead')} <span className="font-medium text-ink">{site}</span>
            {blockedCount > 0 && (
              <span className="text-ink-faint">
                {t('shell.overlay.siteInfo.stoppedOnPage', { count: blockedCount })}
              </span>
            )}
            .
          </>
        )}
      </p>
      <Button size="sm" onClick={toggle}>
        {isAllowed ? t('shell.overlay.siteInfo.blockAgain') : t('shell.overlay.siteInfo.allowOnSite')}
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
        {t('shell.overlay.siteInfo.noPermissions')}
      </p>
    );
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <h2 className="label mb-2">{t('shell.overlay.siteInfo.siteCan')}</h2>
      <ul className="flex flex-col">
        {granted.map((entry) => (
          <li key={entry.kind} className="flex h-8 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
              {PERMISSION_LABELS[entry.kind] ?? entry.kind}
            </span>
            <span
              className={cn('shrink-0 text-body-sm', entry.decision === 'allow' ? 'text-clear' : 'text-ink-faint')}
            >
              {entry.decision === 'allow' ? t('shell.overlay.siteInfo.allowed') : t('shell.overlay.siteInfo.blocked')}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => send((api) => api.permissions.forget(origin, entry.kind))}
            >
              {t('shell.overlay.siteInfo.reset')}
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
  const [exportProblem, setExportProblem] = useState('');

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
        {t('shell.overlay.siteInfo.noRequests')}
      </p>
    );
  }

  const blockedHosts = entries.filter((entry) => entry.blocked > 0).length;
  const visible = isExpanded ? entries : entries.slice(0, 6);

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="label">{t('shell.overlay.siteInfo.hostsContacted')}</h2>
        <p className="text-caption text-ink-faint">
          {t('shell.overlay.siteInfo.hostCount', { count: entries.length })}
          {blockedHosts > 0 && (
            <span className="text-caution"> {t('shell.overlay.siteInfo.blockedHosts', { count: blockedHosts })}</span>
          )}
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
                <span className="shrink-0 text-caption text-caution">
                  {t('shell.overlay.siteInfo.blockedRequests', { count: entry.blocked })}
                </span>
              ) : (
                entry.isTracker && (
                  <span className="shrink-0 text-caption text-ink-faint">{t('shell.overlay.siteInfo.allowed')}</span>
                )
              )}
              <span className="w-6 shrink-0 text-right text-caption text-ink-faint tabular-nums">
                {entry.requests}
              </span>
            </div>
            {/* Which of the two stopped it: a rule can be wrong about one URL, a hostname about a whole company. */}
            {entry.blocked > 0 && (
              <span className="truncate font-mono text-caption text-ink-faint" title={entry.rule ?? undefined}>
                {entry.rule
                  ? t('shell.overlay.siteInfo.byRule', { rule: entry.rule })
                  : t('shell.overlay.siteInfo.byHostname')}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 -ml-2.5 flex items-center gap-1">
        {entries.length > visible.length && (
          <Button size="sm" variant="ghost" onClick={() => setIsExpanded(true)}>
            {t('shell.overlay.siteInfo.showAll', { count: entries.length })}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void ask((api) => api.connections.exportReport(tabId), '').then((problem) => setExportProblem(problem))
          }
        >
          {t('shell.overlay.siteInfo.exportReport')}
        </Button>
      </div>
      {exportProblem && <p className="mt-1 text-caption text-caution">{exportProblem}</p>}
    </div>
  );
}

/** Copacetic remembers every certificate it saw, which is what lets it say a site is presenting a different one. */
function CertificateChangeNotice({ detail }: { detail: string }) {
  return (
    <div className="mx-4 mb-3 rounded-md border border-caution/40 px-3 py-2" role="status">
      <h3 className="mb-1 text-body-sm font-medium text-caution">{t('shell.overlay.siteInfo.certificateChanged')}</h3>
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
        label={t('shell.overlay.siteInfo.issuedBy')}
        value={certificate.issuer}
        icon={<BadgeCheck size={12} aria-hidden />}
        isWarning={!certificate.isIssuedByKnownRoot}
      />
      {!certificate.isIssuedByKnownRoot && (
        <p className="text-body-sm text-caution">{t('shell.overlay.siteInfo.unknownRoot')}</p>
      )}
      {certificate.subject && <Row label={t('shell.overlay.siteInfo.issuedTo')} value={certificate.subject} isMono />}
      <Row
        label={t('shell.overlay.siteInfo.expires')}
        value={formatExpiry(certificate.validTo, daysLeft)}
        icon={<CalendarClock size={12} aria-hidden />}
        isWarning={isExpiringSoon}
      />
    </>
  );
}

export function formatExpiry(validTo: number, daysLeft: number | null): string {
  if (!validTo) {
    return t('shell.overlay.siteInfo.unknown');
  }
  const date = new Date(validTo).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (daysLeft === null) {
    return date;
  }
  if (daysLeft < 0) {
    return t('shell.overlay.siteInfo.expired', { date });
  }
  if (daysLeft === 0) {
    return t('shell.overlay.siteInfo.expiresToday', { date });
  }
  if (daysLeft <= 90) {
    return t('shell.overlay.siteInfo.expiresIn', { date, count: daysLeft });
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
