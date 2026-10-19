'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { InlineRenameField } from '@/components/ui/InlineRenameField/InlineRenameField';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { TextField } from '@/components/ui/TextField/TextField';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import { FIRST_PROFILE_ID } from '@shared/data/partitions';
import { MAX_PROFILE_NAME, type ProfileSummary } from '@shared/data/profiles';
import { GROUP_COLOURS, type GroupColourId } from '@shared/tabs/tab-groups';

const COLOUR_OPTIONS = GROUP_COLOURS.map((colour) => ({
  id: colour.id,
  label: colour.id.charAt(0).toUpperCase() + colour.id.slice(1),
}));

/** Each person's browsing kept apart: its own history, bookmarks, passwords, cookies and settings. */
export function ProfilesPane() {
  const current = useBrowserStore((state) => state.profile);
  const profiles = useBrowserStore((state) => state.profiles);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProfileSummary | null>(null);
  const [newName, setNewName] = useState('');
  const [newColour, setNewColour] = useState<GroupColourId>('moss');

  return (
    <>
      <SettingGroup title={t('settings.profiles.list.title')}>
        {profiles.map((profile) => {
          const isThisWindow = profile.id === current.id;
          return (
            <SettingRow
              key={profile.id}
              label={profile.name}
              help={isThisWindow ? t('settings.profiles.list.thisWindow') : undefined}
              control={
                <>
                  {renamingId === profile.id ? (
                    <InlineRenameField
                      value={profile.name}
                      label={profile.name}
                      maxLength={MAX_PROFILE_NAME}
                      className="h-7 w-40"
                      onCommit={(name) => send((api) => api.profiles.update(profile.id, { name }))}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setRenamingId(profile.id)}>
                      {t('settings.profiles.list.rename')}
                    </Button>
                  )}
                  <Select
                    label={t('settings.profiles.list.colourOf', { name: profile.name })}
                    options={COLOUR_OPTIONS}
                    value={profile.colour}
                    onChange={(colour) => send((api) => api.profiles.update(profile.id, { colour }))}
                  />
                  {!isThisWindow && (
                    <Button size="sm" onClick={() => send((api) => api.profiles.openWindow(profile.id))}>
                      {t('settings.profiles.list.openWindow')}
                    </Button>
                  )}
                  {/* The first holds everything from before profiles; the one in use would close this window. */}
                  {profile.id !== FIRST_PROFILE_ID && !isThisWindow && (
                    <Button size="sm" variant="danger" onClick={() => setRemoving(profile)}>
                      {t('settings.profiles.list.remove')}
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </SettingGroup>

      <SettingGroup title={t('settings.profiles.add.title')}>
        <SettingRow
          label={t('settings.profiles.add.label')}
          help={t('settings.profiles.add.help')}
          control={
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                send(async (api) => {
                  const created = await api.profiles.create(newName, newColour);
                  await api.profiles.openWindow(created.id);
                });
                setNewName('');
              }}
            >
              <TextField
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t('settings.profiles.add.namePlaceholder')}
                aria-label={t('settings.profiles.add.nameLabel')}
                maxLength={MAX_PROFILE_NAME}
                className="h-7 w-40"
              />
              <Select
                label={t('settings.profiles.add.colourLabel')}
                options={COLOUR_OPTIONS}
                value={newColour}
                onChange={setNewColour}
              />
              <Button size="sm" type="submit" disabled={newName.trim() === ''}>
                {t('settings.profiles.add.action')}
              </Button>
            </form>
          }
        />
      </SettingGroup>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRemoving(null);
          }
        }}
        title={t('settings.profiles.remove.title', {
          name: removing?.name ?? t('settings.profiles.remove.fallbackName'),
        })}
        confirmLabel={t('settings.profiles.remove.confirm')}
        isDestructive
        onConfirm={() => {
          if (removing) {
            send((api) => api.profiles.remove(removing.id));
          }
        }}
      >
        {t('settings.profiles.remove.body')}
      </ConfirmDialog>
    </>
  );
}
