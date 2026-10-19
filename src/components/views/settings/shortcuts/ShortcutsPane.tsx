'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Kbd } from '@/components/ui/Kbd/Kbd';
import { SearchField } from '@/components/ui/TextField/TextField';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { isMacPlatform } from '@/lib/platform';
import { updateSettings } from '@/components/views/settings/shared/options';
import { t } from '@shared/i18n/translate';

// Types
import {
  SHORTCUT_GROUPS,
  type Shortcut,
  acceleratorFor,
  acceleratorFromKeys,
  conflictFor,
  isValidAccelerator,
  readableAccelerator,
} from '@shared/chrome/shortcuts';

export function ShortcutsPane() {
  const overrides = useBrowserStore((state) => state.settings.shortcutOverrides);
  const [query, setQuery] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const isMac = isMacPlatform();

  // The menu lets go of its keys only while one is being recorded, and always takes them back.
  useEffect(() => {
    send((api) => api.shortcuts.setRecording(recordingId !== null));
    return () => send((api) => api.shortcuts.setRecording(false));
  }, [recordingId]);

  const needle = query.trim().toLowerCase();
  const matches = (shortcut: Shortcut, isRebindable: boolean) => {
    const current = isRebindable ? (acceleratorFor(shortcut.id, overrides) ?? '') : shortcut.accelerator;
    return (
      !needle ||
      shortcut.description.toLowerCase().includes(needle) ||
      readableAccelerator(current, isMac).toLowerCase().includes(needle)
    );
  };
  const groups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.filter((shortcut) => matches(shortcut, group.isRebindable)),
  })).filter((group) => group.shortcuts.length > 0);

  const record = (id: string, event: React.KeyboardEvent) => {
    event.preventDefault();
    if (event.key === 'Escape') {
      setRecordingId(null);
      setProblem('');
      return;
    }
    const accelerator = acceleratorFromKeys(event, isMac);
    if (!accelerator) {
      return;
    }
    if (!isValidAccelerator(accelerator)) {
      setProblem(t(isMac ? 'settings.shortcuts.holdMac' : 'settings.shortcuts.holdOther'));
      return;
    }
    const conflict = conflictFor(id, accelerator, overrides);
    if (conflict) {
      setProblem(t('settings.shortcuts.conflict', { shortcut: readableAccelerator(accelerator, isMac), conflict }));
      return;
    }
    updateSettings({ shortcutOverrides: { ...overrides, [id]: accelerator } });
    setRecordingId(null);
    setProblem('');
  };

  const reset = (id: string) => {
    updateSettings({
      shortcutOverrides: Object.fromEntries(
        Object.entries(overrides).filter(([overriddenId]) => overriddenId !== id),
      ),
    });
  };

  return (
    <>
      <SearchField value={query} onChange={setQuery} label={t('settings.shortcuts.search')} />
      {groups.length === 0 && <p className="px-0.5 text-body-sm text-ink-dim">{t('settings.shortcuts.noMatch')}</p>}
      {groups.map((group) => (
        <SettingGroup key={group.title} title={group.title}>
          {group.shortcuts.map((shortcut) => {
            const isRecording = recordingId === shortcut.id;
            const current = group.isRebindable ? acceleratorFor(shortcut.id, overrides) : shortcut.accelerator;
            const isChanged = group.isRebindable && Object.hasOwn(overrides, shortcut.id);
            return (
              <SettingRow
                key={shortcut.id}
                label={shortcut.description}
                help={isRecording ? problem || t('settings.shortcuts.recordingHelp') : undefined}
                control={
                  <>
                    {isRecording ? (
                      <button
                        type="button"
                        autoFocus
                        onKeyDown={(event) => record(shortcut.id, event)}
                        onBlur={() => setRecordingId(null)}
                        className="h-8 rounded-sm border border-accent px-2.5 text-body-sm text-ink"
                      >
                        {t('settings.shortcuts.recording')}
                      </button>
                    ) : current ? (
                      <Kbd accelerator={current} />
                    ) : (
                      <span className="text-body-sm text-ink-faint">{t('settings.shortcuts.none')}</span>
                    )}
                    {group.isRebindable && !isRecording && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setProblem('');
                          setRecordingId(shortcut.id);
                        }}
                      >
                        {t('settings.shortcuts.change')}
                      </Button>
                    )}
                    {isChanged && !isRecording && (
                      <Button size="sm" variant="ghost" onClick={() => reset(shortcut.id)}>
                        {t('settings.shortcuts.reset')}
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
        </SettingGroup>
      ))}
    </>
  );
}
