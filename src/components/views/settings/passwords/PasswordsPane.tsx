'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';
import { TextField } from '@/components/ui/TextField/TextField';
import { GeneratorOptions } from '@/components/views/settings/passwords/GeneratorOptions';

// Utils
import { ask } from '@/lib/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { VaultEntry, VaultLock, VaultState } from '@shared/types';
import { DEFAULT_RECIPE, type PasswordRecipe, alphabetsFor } from '@shared/password-generator';
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

const NOTHING_SAVED: VaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };
const OPEN: VaultLock = { isUnlocked: true, method: 'none', detail: '' };

export function PasswordsPane({ openPane }: Partial<Pick<SettingsPaneProps, 'openPane'>>) {
  const [vault, setVault] = useState<VaultState>(NOTHING_SAVED);
  const [lock, setLock] = useState<VaultLock>(OPEN);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [removing, setRemoving] = useState<VaultEntry | null>(null);
  const [isConfirmingExport, setIsConfirmingExport] = useState(false);

  const refresh = useCallback(() => {
    void ask((api) => api.vault.list(), NOTHING_SAVED).then(setVault);
    void ask((api) => api.vault.lockState(), OPEN).then(setLock);
  }, []);

  useEffect(refresh, [refresh]);

  // Auto-lock fires on its own timer in the main process, so this polls rather than going stale.
  useEffect(() => {
    const interval = setInterval(() => {
      void ask((api) => api.vault.lockState(), OPEN).then((next) => {
        setLock(next);
        if (!next.isUnlocked) {
          setRevealed({});
        }
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const toggleReveal = (id: string) => {
    if (revealed[id] !== undefined) {
      setRevealed(({ [id]: _hidden, ...rest }) => rest);
      return;
    }
    void ask((api) => api.vault.reveal(id), null).then((password) => {
      setRevealed((current) => ({ ...current, [id]: password ?? '' }));
    });
  };

  const run = (action: Promise<string>) => {
    setMessage('');
    void action.then((result) => {
      setMessage(result);
      refresh();
    });
  };

  const isUsable = vault.availability !== 'unavailable';

  return (
    <>
      <SettingGroup>
        <SettingRow
          label={t('settings.passwords.intro.label')}
          help={t('settings.passwords.intro.help')}
          control={
            openPane && (
              <Button size="sm" variant="ghost" onClick={() => openPane('transparency')}>
                {t('settings.passwords.intro.protection')}
              </Button>
            )
          }
        />
        {vault.availability !== 'ready' && (
          <SettingRow
            label={
              vault.availability === 'unavailable'
                ? t('settings.passwords.availability.unavailableLabel')
                : t('settings.passwords.availability.unreadableLabel')
            }
            help={<span role="status">{vault.detail}</span>}
            control={
              <StatusPill status={vault.availability === 'unavailable' ? 'danger' : 'warning'}>
                {vault.availability === 'unavailable'
                  ? t('settings.passwords.availability.unavailable')
                  : t('settings.passwords.availability.unreadable')}
              </StatusPill>
            }
          />
        )}
        <SettingRow
          label={lock.isUnlocked ? t('settings.passwords.lock.unlocked') : t('settings.passwords.lock.locked')}
          help={lock.detail}
          control={
            lock.isUnlocked ? (
              <Button size="sm" onClick={() => void ask((api) => api.vault.lock(), undefined).then(refresh)}>
                {t('settings.passwords.lock.lockNow')}
              </Button>
            ) : (
              // Never "Unlock with Touch ID": macOS may ask for the login password instead.
              <Button size="sm" onClick={() => run(ask((api) => api.vault.unlock(), ''))}>
                {t('settings.passwords.lock.unlock')}
              </Button>
            )
          }
        />
      </SettingGroup>

      {message && (
        <p className="px-0.5 text-body-sm text-ink-dim" role="status">
          {message}
        </p>
      )}

      <SettingGroup
        title={
          vault.entries.length
            ? t('settings.passwords.saved.titleWithCount', { count: vault.entries.length })
            : t('settings.passwords.saved.title')
        }
      >
        {vault.entries.length === 0 && !isAdding && <SettingRow label={t('settings.passwords.saved.empty')} />}
        {vault.entries.map((entry) => (
          <SettingRow
            key={entry.id}
            // Which site it was for is sealed with it, so a row this machine cannot open has no site to show.
            label={
              entry.origin ? entry.origin.replace(/^https?:\/\//, '') : t('settings.passwords.saved.unreadableEntry')
            }
            help={
              revealed[entry.id] !== undefined ? (
                <span className="font-mono text-ink select-text">
                  {revealed[entry.id] || t('settings.passwords.saved.emptyValue')}
                </span>
              ) : (
                entry.username || t('settings.passwords.saved.noUsername')
              )
            }
            control={
              <>
                {!entry.isReadable && (
                  <StatusPill status="warning">{t('settings.passwords.availability.unreadable')}</StatusPill>
                )}
                {entry.isReadable && lock.isUnlocked && (
                  <Button size="sm" variant="ghost" onClick={() => toggleReveal(entry.id)}>
                    {revealed[entry.id] === undefined
                      ? t('settings.passwords.saved.show')
                      : t('settings.passwords.saved.hide')}
                  </Button>
                )}
                {lock.isUnlocked && (
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(entry)}>
                    {t('settings.passwords.saved.remove')}
                  </Button>
                )}
              </>
            }
          />
        ))}
        {isUsable &&
          (isAdding ? (
            <AddPasswordForm
              onDone={(result) => {
                setIsAdding(false);
                setMessage(result);
                refresh();
              }}
              onCancel={() => setIsAdding(false)}
            />
          ) : (
            <div className="px-3.5 py-2.5">
              <Button size="sm" onClick={() => setIsAdding(true)}>
                {t('settings.passwords.saved.add')}
              </Button>
            </div>
          ))}
      </SettingGroup>

      <SettingGroup title={t('settings.passwords.transfer.title')}>
        <SettingRow
          label={t('settings.passwords.transfer.export.label')}
          help={t('settings.passwords.transfer.export.help')}
          control={
            <Button size="sm" onClick={() => setIsConfirmingExport(true)}>
              {t('settings.passwords.transfer.export.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.passwords.transfer.import.label')}
          help={t('settings.passwords.transfer.import.help')}
          control={
            <Button size="sm" onClick={() => run(ask((api) => api.vault.importFile(), ''))}>
              {t('settings.passwords.transfer.import.action')}
            </Button>
          }
        />
      </SettingGroup>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('settings.passwords.removeDialog.title')}
        confirmLabel={t('settings.passwords.removeDialog.confirm')}
        isDestructive
        onConfirm={() => {
          const entry = removing;
          setRemoving(null);
          if (entry) {
            // The answer is shown rather than dropped: refusing quietly is how a button looks broken.
            void ask((api) => api.vault.remove(entry.id), null).then((result) => {
              setMessage(result ? result.error : '');
              refresh();
            });
          }
        }}
      >
        {t('settings.passwords.removeDialog.body', {
          account: removing?.username || t('settings.passwords.removeDialog.fallbackAccount'),
          site: removing?.origin.replace(/^https?:\/\//, '') ?? '',
        })}
      </ConfirmDialog>

      <ConfirmDialog
        open={isConfirmingExport}
        onOpenChange={setIsConfirmingExport}
        title={t('settings.passwords.exportDialog.title')}
        confirmLabel={t('settings.passwords.exportDialog.confirm')}
        onConfirm={() => run(ask((api) => api.vault.exportAll(), ''))}
      >
        {t('settings.passwords.exportDialog.body')}
      </ConfirmDialog>
    </>
  );
}

function AddPasswordForm({ onDone, onCancel }: { onDone: (message: string) => void; onCancel: () => void }) {
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isShowingPassword, setIsShowingPassword] = useState(false);
  const [error, setError] = useState('');
  const [recipe, setRecipe] = useState<PasswordRecipe>(DEFAULT_RECIPE);
  const [hasGenerated, setHasGenerated] = useState(false);

  const save = () => {
    void ask((api) => api.vault.add({ origin, username, password }), {
      error: t('settings.passwords.form.nothingSaved'),
    }).then((result) => {
      if ('error' in result) {
        setError(result.error);
        return;
      }
      onDone('');
    });
  };

  // Generated in the main process, where the random source is, and shown so it can be checked.
  const generate = (from: PasswordRecipe) => {
    if (alphabetsFor(from).length === 0) {
      return;
    }
    void ask((api) => api.vault.generate(from), '').then((generated) => {
      if (generated) {
        setPassword(generated);
        setIsShowingPassword(true);
        setHasGenerated(true);
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-2 px-3.5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <TextField
        aria-label={t('settings.passwords.form.site')}
        placeholder={t('settings.passwords.form.sitePlaceholder')}
        value={origin}
        onChange={(event) => setOrigin(event.target.value)}
        autoFocus
      />
      <TextField
        aria-label={t('settings.passwords.form.username')}
        placeholder={t('settings.passwords.form.usernamePlaceholder')}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <div className="flex gap-2">
        <TextField
          aria-label={t('settings.passwords.form.password')}
          placeholder={t('settings.passwords.form.password')}
          type={isShowingPassword ? 'text' : 'password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={isShowingPassword ? 'font-mono' : undefined}
        />
        <Button variant="ghost" onClick={() => generate(recipe)}>
          {t('settings.passwords.form.generate')}
        </Button>
      </div>
      {hasGenerated && (
        <GeneratorOptions
          value={recipe}
          onChange={(next) => {
            setRecipe(next);
            generate(next);
          }}
        />
      )}
      {error && <p className="text-body-sm text-alert">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          {t('settings.passwords.form.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!origin.trim() || !password}>
          {t('settings.passwords.form.save')}
        </Button>
      </div>
    </form>
  );
}
