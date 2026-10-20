'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards/ChoiceCards';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { InlineRenameField } from '@/components/ui/InlineRenameField/InlineRenameField';
import { ProfileAvatar } from '@/components/shell/ProfileAvatar/ProfileAvatar';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { TextField } from '@/components/ui/TextField/TextField';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import { FIRST_PROFILE_ID } from '@shared/data/partitions';
import { MAX_PROFILE_NAME, type ProfileSummary } from '@shared/data/profiles';
import { GROUP_COLOURS, type GroupColourId } from '@shared/tabs/tab-groups';

const COLOUR_OPTIONS = GROUP_COLOURS.map((colour) => ({
  id: colour.id,
  label: colour.id.charAt(0).toUpperCase() + colour.id.slice(1),
  preview: <span className="block size-5 rounded-full" style={{ background: colour.hex }} />,
}));

function ColourSwatches({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GroupColourId;
  onChange: (colour: GroupColourId) => void;
}) {
  return (
    <ChoiceCards
      label={label}
      options={COLOUR_OPTIONS}
      value={value}
      hasCaptions={false}
      onChange={onChange}
      className="gap-1"
    />
  );
}

/** Each person's browsing kept apart: its own history, bookmarks, passwords, cookies and settings. */
export function ProfilesPane() {
  const current = useBrowserStore((state) => state.profile);
  const profiles = useBrowserStore((state) => state.profiles);
  const [removing, setRemoving] = useState<ProfileSummary | null>(null);
  const [newName, setNewName] = useState('');
  const [newColour, setNewColour] = useState<GroupColourId>('moss');

  return (
    <>
      <SettingGroup title={t('settings.profiles.list.title')}>
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isThisWindow={profile.id === current.id}
            onRemove={() => setRemoving(profile)}
          />
        ))}
      </SettingGroup>

      <SettingGroup title={t('settings.profiles.add.title')}>
        <SettingRow
          label={t('settings.profiles.add.label')}
          help={t('settings.profiles.add.help')}
          isStacked
          control={
            <>
              {/* Outside the form: a radio group in one adds hidden inputs the submit has no use for. */}
              <ColourSwatches
                label={t('settings.profiles.add.colourLabel')}
                value={newColour}
                onChange={setNewColour}
              />
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
                  className="h-7 w-48"
                />
                <Button size="sm" type="submit" disabled={newName.trim() === ''}>
                  {t('settings.profiles.add.action')}
                </Button>
              </form>
            </>
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

function ProfileCard({
  profile,
  isThisWindow,
  onRemove,
}: {
  profile: ProfileSummary;
  isThisWindow: boolean;
  onRemove: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [pictureError, setPictureError] = useState('');

  const choosePicture = async () => {
    setPictureError(await ask((api) => api.profiles.choosePicture(profile.id), ''));
  };

  return (
    <div data-setting-row className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <ProfileAvatar profile={profile} size="large" />
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <InlineRenameField
              value={profile.name}
              label={profile.name}
              maxLength={MAX_PROFILE_NAME}
              className="h-7 w-48"
              onCommit={(name) => send((api) => api.profiles.update(profile.id, { name }))}
              onCancel={() => setIsRenaming(false)}
            />
          ) : (
            <div className="truncate text-reading font-medium text-ink">{profile.name}</div>
          )}
          {isThisWindow && <div className="text-body text-ink-dim">{t('settings.profiles.list.thisWindow')}</div>}
        </div>
        {!isRenaming && (
          <Button size="sm" variant="ghost" onClick={() => setIsRenaming(true)}>
            {t('settings.profiles.list.rename')}
          </Button>
        )}
        {!isThisWindow && (
          <Button size="sm" onClick={() => send((api) => api.profiles.openWindow(profile.id))}>
            {t('settings.profiles.list.openWindow')}
          </Button>
        )}
        {/* The first holds everything from before profiles; the one in use would close this window. */}
        {profile.id !== FIRST_PROFILE_ID && !isThisWindow && (
          <Button size="sm" variant="danger" onClick={onRemove}>
            {t('settings.profiles.list.remove')}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-15">
        <ColourSwatches
          label={t('settings.profiles.list.colourOf', { name: profile.name })}
          value={profile.colour}
          onChange={(colour) => send((api) => api.profiles.update(profile.id, { colour }))}
        />
        <Button
          size="sm"
          variant="ghost"
          title={t('settings.profiles.list.pictureHelp')}
          onClick={() => void choosePicture()}
        >
          {t('settings.profiles.list.choosePicture')}
        </Button>
        {profile.pictureVersion !== null && (
          <Button size="sm" variant="ghost" onClick={() => send((api) => api.profiles.removePicture(profile.id))}>
            {t('settings.profiles.list.useInitials')}
          </Button>
        )}
      </div>
      {pictureError && <div className="pl-15 text-body text-alert">{pictureError}</div>}
    </div>
  );
}
