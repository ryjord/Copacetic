'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { InlineRenameField } from '@/components/ui/InlineRenameField/InlineRenameField';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { formatDateHeading } from '@/lib/text/format';
import { MAX_SESSION_NAME } from '@shared/data/named-sessions';
import { t } from '@shared/i18n/translate';

/** Every saved session, to open, rename or delete; saving one happens from the tabs it keeps. */
export function SavedSessions() {
  const sessions = useBrowserStore((state) => state.namedSessions);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Read once, so a list left open does not need the clock to render.
  const [now] = useState(() => Date.now());

  return (
    <SettingGroup title={t('settings.data.sessions.title')}>
      {sessions.length === 0 ? (
        <SettingRow label={t('settings.data.sessions.empty')} help={t('settings.data.sessions.emptyHelp')} />
      ) : (
        sessions.map((session) => (
          <SettingRow
            key={session.id}
            label={session.name}
            help={t('settings.data.sessions.detail', {
              tabs: t('settings.data.sessions.tabCount', { count: session.tabCount }),
              date: formatDateHeading(session.savedAt, now),
            })}
            control={
              renamingId === session.id ? (
                <InlineRenameField
                  value={session.name}
                  label={session.name}
                  maxLength={MAX_SESSION_NAME}
                  onCommit={(name) => send((api) => api.sessions.rename(session.id, name))}
                  onCancel={() => setRenamingId(null)}
                  className="w-56 rounded-sm bg-inset px-2 py-1 text-reading text-ink outline-none"
                />
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setRenamingId(session.id)}>
                    {t('settings.data.sessions.rename')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => send((api) => api.sessions.remove(session.id))}>
                    {t('settings.data.sessions.remove')}
                  </Button>
                  <Button size="sm" onClick={() => send((api) => api.sessions.open(session.id))}>
                    {t('settings.data.sessions.open')}
                  </Button>
                </>
              )
            }
          />
        ))
      )}
    </SettingGroup>
  );
}
