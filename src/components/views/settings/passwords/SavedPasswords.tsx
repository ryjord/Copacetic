'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';
import { SearchField, TextField } from '@/components/ui/TextField/TextField';

// Icons
import { Copy, Ellipsis, KeyRound } from 'lucide-react';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { VaultEntry } from '@shared/types';

type PasswordSort = 'site' | 'changed';

const SORT_OPTIONS: readonly { id: PasswordSort; label: string }[] = [
  { id: 'site', label: t('settings.passwords.saved.sort.site') },
  { id: 'changed', label: t('settings.passwords.saved.sort.changed') },
];

// Long enough to read or type it, short enough that a password left on screen does not stay there.
const HIDE_AFTER_MS = 20_000;

const siteLabel = (entry: VaultEntry) => entry.origin.replace(/^https?:\/\//, '');

interface SavedPasswordsProps {
  entries: VaultEntry[];
  isUnlocked: boolean;
  onRemove: (entry: VaultEntry) => void;
  /** Something changed in the vault, so the list should be asked for again. */
  onChanged: () => void;
}

export function SavedPasswords({ entries, isUnlocked, onRemove, onChanged }: SavedPasswordsProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PasswordSort>('site');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { revealed, toggle } = useRevealed(isUnlocked);

  const needle = query.trim().toLowerCase();
  const shown = entries
    .filter((entry) => !needle || `${entry.origin} ${entry.username}`.toLowerCase().includes(needle))
    .toSorted((aEntry, bEntry) =>
      sort === 'site' ? siteLabel(aEntry).localeCompare(siteLabel(bEntry)) : bEntry.updatedAt - aEntry.updatedAt,
    );

  // Said in the row the action was taken in, rather than at the top of the pane.
  const note = (id: string, text: string) => setNotes((current) => ({ ...current, [id]: text }));

  const copy = async (entry: VaultEntry, field: 'username' | 'password') => {
    const isCopied = await ask((api) => api.vault.copy(entry.id, field), false);
    if (isCopied) {
      note(
        entry.id,
        field === 'password'
          ? t('settings.passwords.saved.copiedPassword')
          : t('settings.passwords.saved.copiedUsername'),
      );
    }
  };

  return (
    <>
      {entries.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
          <div className="min-w-48 flex-1">
            <SearchField value={query} onChange={setQuery} label={t('settings.passwords.saved.search')} />
          </div>
          <SegmentedControl
            label={t('settings.passwords.saved.sort.label')}
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />
        </div>
      )}
      {needle && shown.length === 0 && <SettingRow label={t('settings.passwords.saved.noMatch')} />}
      {shown.map((entry) =>
        editingId === entry.id ? (
          <EditPasswordForm
            key={entry.id}
            entry={entry}
            onSaved={() => {
              setEditingId(null);
              onChanged();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <SettingRow
            key={entry.id}
            // Which site it was for is sealed with it, so a row this machine cannot open has no site to show.
            label={entry.origin ? siteLabel(entry) : t('settings.passwords.saved.unreadableEntry')}
            help={
              revealed[entry.id] !== undefined ? (
                <>
                  <span className="font-mono text-ink select-text">
                    {revealed[entry.id] || t('settings.passwords.saved.emptyValue')}
                  </span>{' '}
                  {t('settings.passwords.saved.hidesItself')}
                </>
              ) : (
                <>
                  {entry.username || t('settings.passwords.saved.noUsername')}
                  {notes[entry.id] && (
                    <span role="status" className="block text-ink">
                      {notes[entry.id]}
                    </span>
                  )}
                </>
              )
            }
            control={
              <>
                {!entry.isReadable && (
                  <StatusPill status="warning">{t('settings.passwords.availability.unreadable')}</StatusPill>
                )}
                {entry.isReadable && isUnlocked && (
                  <>
                    {entry.username && (
                      <IconButton
                        label={t('settings.passwords.saved.copyUsername')}
                        onClick={() => void copy(entry, 'username')}
                      >
                        <Copy size={15} />
                      </IconButton>
                    )}
                    <IconButton
                      label={t('settings.passwords.saved.copyPassword')}
                      onClick={() => void copy(entry, 'password')}
                    >
                      <KeyRound size={15} />
                    </IconButton>
                    <Button size="sm" variant="ghost" onClick={() => toggle(entry.id)}>
                      {revealed[entry.id] === undefined
                        ? t('settings.passwords.saved.show')
                        : t('settings.passwords.saved.hide')}
                    </Button>
                  </>
                )}
                {isUnlocked && (
                  <Menu
                    trigger={
                      <IconButton label={t('settings.passwords.saved.more', { site: siteLabel(entry) })}>
                        <Ellipsis size={16} />
                      </IconButton>
                    }
                    items={[
                      ...(entry.isReadable
                        ? [{ label: t('settings.passwords.saved.edit'), onSelect: () => setEditingId(entry.id) }]
                        : []),
                      {
                        label: t('settings.passwords.saved.remove'),
                        isDestructive: true,
                        onSelect: () => onRemove(entry),
                      },
                    ]}
                  />
                )}
              </>
            }
          />
        ),
      )}
    </>
  );
}

/** Revealed passwords, each hidden again on its own timer, and all of them the moment the vault locks. */
function useRevealed(isUnlocked: boolean) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const hide = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setRevealed(({ [id]: _hidden, ...rest }) => rest);
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const toggle = (id: string) => {
    if (revealed[id] !== undefined) {
      hide(id);
      return;
    }
    void ask((api) => api.vault.reveal(id), null).then((password) => {
      setRevealed((current) => ({ ...current, [id]: password ?? '' }));
      timers.current.set(
        id,
        setTimeout(() => hide(id), HIDE_AFTER_MS),
      );
    });
  };

  return { revealed: isUnlocked ? revealed : {}, toggle };
}

function EditPasswordForm({
  entry,
  onSaved,
  onCancel,
}: {
  entry: VaultEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState(entry.username);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');

  const save = async () => {
    // An empty field keeps the password it has: editing a username should not need the password retyped.
    const changes = password ? { username, password } : { username };
    const found = await ask((api) => api.vault.update(entry.id, changes), '');
    if (found) {
      setProblem(found);
      return;
    }
    onSaved();
  };

  return (
    <form
      data-setting-row
      className="flex flex-col gap-2 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="text-reading font-medium text-ink">{siteLabel(entry)}</div>
      <TextField
        aria-label={t('settings.passwords.edit.username')}
        placeholder={t('settings.passwords.edit.username')}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoFocus
      />
      <TextField
        aria-label={t('settings.passwords.edit.password')}
        placeholder={t('settings.passwords.edit.passwordPlaceholder')}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {problem && <p className="text-body-sm text-alert">{problem}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          {t('settings.passwords.edit.cancel')}
        </Button>
        <Button type="submit" variant="primary">
          {t('settings.passwords.edit.save')}
        </Button>
      </div>
    </form>
  );
}
