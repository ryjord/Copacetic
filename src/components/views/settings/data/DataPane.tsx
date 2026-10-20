'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { BrowserImportRow } from '@/components/views/settings/data/BrowserImportRow';
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { SavedSessions } from '@/components/views/settings/data/SavedSessions';
import { TranslationModels } from '@/components/views/settings/data/TranslationModels';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { CLEAR_RANGES } from '@/lib/text/clearing';
import { t } from '@shared/i18n/translate';

// Types
import type { ClearRange, ExportKind, ImportSource } from '@shared/types';
import {
  KEPT_KINDS,
  UNDOABLE_KEPT_KINDS,
  type KeptAboutSites,
  type KeptKind,
  describeKept,
} from '@shared/data/forgetting';

/** A result said under the group whose button caused it. */
function ResultRow({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return (
    <div role="status">
      <SettingRow label={message} />
    </div>
  );
}

/** In the order people come here for it: bring things in or take them out, then clear, then what clearing keeps. */
export function DataPane() {
  const historyRetentionDays = useBrowserStore((state) => state.settings.historyRetentionDays);
  const [kept, setKept] = useState<KeptAboutSites | null>(null);
  const [range, setRange] = useState<ClearRange>('hour');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmingKind, setConfirmingKind] = useState<KeptKind | null>(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [sources, setSources] = useState<ImportSource[]>([]);

  const reload = useCallback(() => {
    void ask((api) => api.data.kept(), null).then(setKept);
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    void ask((api) => api.data.importSources(), []).then(setSources);
  }, []);

  const transfer = (action: Promise<string>) => {
    setTransferMessage('');
    void action.then(setTransferMessage);
  };

  const exportData = (kind: ExportKind) => transfer(ask((api) => api.data.export(kind), ''));

  // Counted again once it is gone, not while it is still going.
  const clearKept = async (kind: KeptKind) => {
    await ask((api) => api.data.clearKept(kind), undefined);
    reload();
  };

  const keptKinds = KEPT_KINDS.filter((entry) => (kept?.[entry.id] ?? 0) > 0);
  const describe = (kind: KeptKind) => describeKept(kind, kept?.[kind] ?? 0);

  return (
    <>
      <SettingGroup title={t('settings.data.import.title')}>
        <BrowserImportRow sources={sources} onResult={setTransferMessage} />
        <SettingRow
          label={t('settings.data.import.bookmarks.label')}
          help={t('settings.data.import.bookmarks.help')}
          control={
            <Button size="sm" onClick={() => transfer(ask((api) => api.data.importBookmarks(), ''))}>
              {t('settings.data.import.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.data.import.history.label')}
          help={t('settings.data.import.history.help')}
          control={
            <Button size="sm" onClick={() => transfer(ask((api) => api.data.importHistory(), ''))}>
              {t('settings.data.import.action')}
            </Button>
          }
        />
        <ResultRow message={transferMessage} />
      </SettingGroup>

      <SettingGroup title={t('settings.data.export.title')}>
        <SettingRow
          label={t('settings.data.export.bookmarks.label')}
          help={t('settings.data.export.bookmarks.help')}
          control={
            <Button size="sm" onClick={() => exportData('bookmarks')}>
              {t('settings.data.export.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.data.export.history.label')}
          help={t('settings.data.export.history.help')}
          control={
            <Button size="sm" onClick={() => exportData('history')}>
              {t('settings.data.export.action')}
            </Button>
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.data.browsing.title')}>
        <SettingRow
          label={t('settings.data.browsing.label')}
          help={
            historyRetentionDays === 0
              ? t('settings.data.browsing.helpForever')
              : t('settings.data.browsing.helpKept', { days: historyRetentionDays })
          }
          control={
            <>
              <Select
                label={t('settings.data.browsing.range')}
                options={CLEAR_RANGES}
                value={range}
                onChange={setRange}
              />
              <Button size="sm" variant="danger" onClick={() => setIsConfirming(true)}>
                {t('settings.data.browsing.action')}
              </Button>
            </>
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.data.kept.title')}>
        {keptKinds.length === 0 ? (
          <SettingRow label={t('settings.data.kept.empty')} />
        ) : (
          keptKinds.map((entry) => (
            <SettingRow
              key={entry.id}
              label={describe(entry.id)}
              control={
                <Button
                  size="sm"
                  variant="ghost"
                  // What can be put back is cleared at once with Undo; what cannot is asked about first.
                  onClick={() =>
                    UNDOABLE_KEPT_KINDS.includes(entry.id) ? void clearKept(entry.id) : setConfirmingKind(entry.id)
                  }
                >
                  {t('settings.data.kept.clear')}
                </Button>
              }
            />
          ))
        )}
      </SettingGroup>

      <SavedSessions />

      <TranslationModels />

      <ClearBrowsingDialog
        key={range}
        range={range}
        open={isConfirming}
        onOpenChange={setIsConfirming}
        onConfirm={async (choice) => {
          await ask((api) => api.history.clear(range, choice), undefined);
          reload();
        }}
      />

      <ConfirmDialog
        open={confirmingKind !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setConfirmingKind(null);
          }
        }}
        title={t('settings.data.kept.confirmTitle')}
        confirmLabel={t('settings.data.kept.confirm')}
        isDestructive
        onConfirm={() => {
          if (confirmingKind) {
            void clearKept(confirmingKind);
          }
        }}
      >
        {confirmingKind && t('settings.data.kept.confirmBody', { what: describe(confirmingKind) })}
      </ConfirmDialog>
    </>
  );
}
