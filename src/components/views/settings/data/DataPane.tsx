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
import { CLEAR_RANGES, WHAT_CLEARING_REMOVES, clearTitle } from '@/lib/clearing';

// Types
import type { ClearRange, ExportKind, ImportSource } from '@shared/types';
import { KEPT_KINDS, type KeptAboutSites, describeKept } from '@shared/forgetting';

export function DataPane() {
  const [kept, setKept] = useState<KeptAboutSites | null>(null);
  const [range, setRange] = useState<ClearRange>('hour');
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void ask((api) => api.data.kept(), null).then(setKept);
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    void ask((api) => api.data.importSources(), []).then(setSources);
  }, []);

  const chosenSource = sources.find((source) => source.id === chosenSourceId) ?? sources[0];

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
              <Select label="Time range" options={CLEAR_RANGES} value={range} onChange={setRange} />
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
        <SettingRow
          label="From another browser"
          help={
            chosenSource
              ? 'Bookmarks, and the last 90 days of history. Passwords are left where they are.'
              : 'No Chrome, Brave, Edge, Vivaldi or Arc profile was found on this computer.'
          }
          control={
            chosenSource && (
              <>
                <Select
                  label="Browser to import from"
                  options={sources}
                  value={chosenSource.id}
                  onChange={setChosenSourceId}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setMessage('');
                    void ask((api) => api.data.importFromBrowser(chosenSource.id), '').then(setMessage);
                  }}
                >
                  Import
                </Button>
              </>
            )
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
        title={clearTitle(range)}
        confirmLabel="Clear"
        isDestructive
        onConfirm={() => {
          send((api) => api.history.clear(range));
          reload();
        }}
      >
        {WHAT_CLEARING_REMOVES[range]} Open tabs stay open.
      </ConfirmDialog>
    </>
  );
}
