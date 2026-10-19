'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { ask, send } from '@/lib/bridge';

// Types
import type { ClearRange, ExportKind } from '@shared/types';
import { KEPT_KINDS, type KeptAboutSites, describeKept } from '@shared/forgetting';

const RANGES: readonly { id: ClearRange; label: string }[] = [
  { id: 'hour', label: 'Last hour' },
  { id: 'day', label: 'Last 24 hours' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
];

/** What a clear removes, said before it happens. A time range touches history only; all time reaches every session. */
const CLEARS: Record<ClearRange, string> = {
  hour: 'History from the last hour is removed.',
  day: 'History from the last 24 hours is removed.',
  week: 'History from the last 7 days is removed.',
  all: 'All history, cookies, site data and the cache are removed, including those of groups that keep their own. You will be signed out of sites.',
};

export function DataPane() {
  const [kept, setKept] = useState<KeptAboutSites | null>(null);
  const [range, setRange] = useState<ClearRange>('hour');
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState('');

  const reload = useCallback(() => {
    void ask((api) => api.data.kept(), null).then(setKept);
  }, []);

  useEffect(reload, [reload]);

  const exportData = (kind: ExportKind) => {
    setMessage('');
    void ask((api) => api.data.export(kind), '').then(setMessage);
  };

  const keptKinds = KEPT_KINDS.filter((entry) => (kept?.[entry.id] ?? 0) > 0);

  return (
    <>
      <SettingGroup title="Browsing data">
        <SettingRow
          label="Clear browsing data"
          help="History older than 90 days is removed automatically."
          control={
            <>
              <Select label="Time range" options={RANGES} value={range} onChange={setRange} />
              <Button size="sm" variant="danger" onClick={() => setIsConfirming(true)}>
                Clear…
              </Button>
            </>
          }
        />
      </SettingGroup>

      <SettingGroup title="Kept when you clear">
        {keptKinds.length === 0 ? (
          <SettingRow label="Nothing is kept about particular sites" />
        ) : (
          keptKinds.map((entry) => (
            <SettingRow
              key={entry.id}
              label={describeKept(entry.id, kept?.[entry.id] ?? 0)}
              control={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    send((api) => api.data.clearKept(entry.id));
                    reload();
                  }}
                >
                  Clear
                </Button>
              }
            />
          ))
        )}
      </SettingGroup>

      <SettingGroup title="Export">
        <SettingRow
          label="Bookmarks"
          help="An HTML file every browser can import."
          control={
            <Button size="sm" onClick={() => exportData('bookmarks')}>
              Export
            </Button>
          }
        />
        <SettingRow
          label="History"
          help="A JSON file you can read in any text editor."
          control={
            <Button size="sm" onClick={() => exportData('history')}>
              Export
            </Button>
          }
        />
      </SettingGroup>

      <SettingGroup title="Import">
        <SettingRow
          label="Bookmarks"
          help="From the HTML file Chrome, Firefox, Safari or Edge exports."
          control={
            <Button
              size="sm"
              onClick={() => {
                setMessage('');
                void ask((api) => api.data.importBookmarks(), '').then(setMessage);
              }}
            >
              Import
            </Button>
          }
        />
      </SettingGroup>

      {message && (
        <p className="px-0.5 text-body-sm text-ink-dim" role="status">
          {message}
        </p>
      )}

      <ConfirmDialog
        open={isConfirming}
        onOpenChange={setIsConfirming}
        title={`Clear browsing data from ${RANGES.find((option) => option.id === range)?.label.toLowerCase()}?`}
        confirmLabel="Clear"
        isDestructive
        onConfirm={() => {
          send((api) => api.history.clear(range));
          reload();
        }}
      >
        {CLEARS[range]} Open tabs stay open.
      </ConfirmDialog>
    </>
  );
}
