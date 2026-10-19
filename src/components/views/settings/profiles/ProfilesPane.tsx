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
import { send } from '@/lib/bridge';

// Types
import { FIRST_PROFILE_ID } from '@shared/partitions';
import { MAX_PROFILE_NAME, type ProfileSummary } from '@shared/profiles';
import { GROUP_COLOURS, type GroupColourId } from '@shared/tab-groups';

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
      <SettingGroup title="Profiles">
        {profiles.map((profile) => {
          const isThisWindow = profile.id === current.id;
          return (
            <SettingRow
              key={profile.id}
              label={profile.name}
              help={isThisWindow ? 'This window' : undefined}
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
                      Rename
                    </Button>
                  )}
                  <Select
                    label={`Colour of ${profile.name}`}
                    options={COLOUR_OPTIONS}
                    value={profile.colour}
                    onChange={(colour) => send((api) => api.profiles.update(profile.id, { colour }))}
                  />
                  {!isThisWindow && (
                    <Button size="sm" onClick={() => send((api) => api.profiles.openWindow(profile.id))}>
                      Open window
                    </Button>
                  )}
                  {/* The first holds everything from before profiles; the one in use would close this window. */}
                  {profile.id !== FIRST_PROFILE_ID && !isThisWindow && (
                    <Button size="sm" variant="danger" onClick={() => setRemoving(profile)}>
                      Remove…
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </SettingGroup>

      <SettingGroup title="Add a profile">
        <SettingRow
          label="New profile"
          help="Starts empty and opens in a window of its own."
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
                placeholder="Name"
                aria-label="New profile name"
                maxLength={MAX_PROFILE_NAME}
                className="h-7 w-40"
              />
              <Select label="New profile colour" options={COLOUR_OPTIONS} value={newColour} onChange={setNewColour} />
              <Button size="sm" type="submit" disabled={newName.trim() === ''}>
                Add
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
        title={`Remove ${removing?.name ?? 'this profile'}?`}
        confirmLabel="Remove"
        isDestructive
        onConfirm={() => {
          if (removing) {
            send((api) => api.profiles.remove(removing.id));
          }
        }}
      >
        Its history, bookmarks, passwords, cookies and settings are deleted from this computer, and its windows close.
        This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
