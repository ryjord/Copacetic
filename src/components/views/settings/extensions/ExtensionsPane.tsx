'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';
import { Switch } from '@/components/ui/Switch/Switch';
import { TextField } from '@/components/ui/TextField/TextField';

// Icons
import { Ellipsis, Puzzle } from 'lucide-react';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { abilitiesOf } from '@shared/extensions/abilities';
import { t } from '@shared/i18n/translate';

// Types
import type { ExtensionSummary } from '@shared/extensions/extensions';

export function ExtensionsPane() {
  const [extensions, setExtensions] = useState<ExtensionSummary[] | null>(null);
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removing, setRemoving] = useState<ExtensionSummary | null>(null);

  const reload = useCallback(() => {
    void ask((api) => api.extensions.list(), []).then(setExtensions);
  }, []);

  useEffect(() => {
    reload();
    return getBridge()?.on.extensionsChanged(reload);
  }, [reload]);

  const add = async (adding: () => Promise<string>) => {
    setIsAdding(true);
    setProblem('');
    const found = await adding();
    setIsAdding(false);
    setProblem(found);
    if (!found) {
      setAddress('');
    }
  };

  const list = extensions ?? [];

  return (
    <>
      <SettingGroup>
        <SettingRow
          label={t('settings.extensions.beta.label')}
          help={t('settings.extensions.beta.help')}
          control={<StatusPill status="neutral">{t('settings.extensions.beta.pill')}</StatusPill>}
        />
        <SettingRow
          label={t('settings.extensions.compatibility.label')}
          help={t('settings.extensions.compatibility.help')}
        />
      </SettingGroup>

      <SettingGroup title={t('settings.extensions.add.title')}>
        <form
          data-setting-row
          className="flex flex-wrap items-center gap-2 px-3.5 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void add(() => ask((api) => api.extensions.addFromWebStore(address), ''));
          }}
        >
          <div className="min-w-48 flex-1">
            <TextField
              aria-label={t('settings.extensions.add.field')}
              placeholder={t('settings.extensions.add.placeholder')}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={isAdding || address.trim() === ''}>
            {isAdding ? t('settings.extensions.add.adding') : t('settings.extensions.add.action')}
          </Button>
        </form>
        {problem && (
          <p role="alert" className="px-3.5 pb-2.5 text-body-sm text-alert">
            {problem}
          </p>
        )}
        <SettingRow
          label={t('settings.extensions.add.fromFolder')}
          help={t('settings.extensions.add.fromFolderHelp')}
          control={
            <Button
              size="sm"
              disabled={isAdding}
              onClick={() => void add(() => ask((api) => api.extensions.addFromFolder(), ''))}
            >
              {t('settings.extensions.add.fromFolder')}
            </Button>
          }
        />
      </SettingGroup>

      <SettingGroup
        title={
          list.length > 0
            ? t('settings.extensions.installed.titleWithCount', { count: list.length })
            : t('settings.extensions.installed.title')
        }
      >
        {extensions !== null && list.length === 0 && <SettingRow label={t('settings.extensions.installed.none')} />}
        {list.map((extension) => (
          <ExtensionRow key={extension.id} extension={extension} onRemove={() => setRemoving(extension)} />
        ))}
      </SettingGroup>

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title={t('settings.extensions.remove.title', { name: removing.name })}
          confirmLabel={t('settings.extensions.remove.confirm')}
          isDestructive
          onConfirm={() => {
            const { id } = removing;
            setRemoving(null);
            send((api) => api.extensions.remove(id));
          }}
        >
          {removing.source === 'folder'
            ? t('settings.extensions.remove.bodyFolder')
            : t('settings.extensions.remove.body')}
        </ConfirmDialog>
      )}
    </>
  );
}

function ExtensionRow({ extension, onRemove }: { extension: ExtensionSummary; onRemove: () => void }) {
  const abilities = abilitiesOf(extension.permissions, extension.hostPermissions);
  return (
    <SettingRow
      label={extension.name}
      help={
        <>
          <span className="flex items-center gap-2">
            {extension.iconDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL from the extension's own files, nothing to optimise
              <img src={extension.iconDataUrl} alt="" className="size-4" draggable={false} />
            ) : (
              <Puzzle size={14} aria-hidden />
            )}
            <span>
              {extension.version}
              {extension.source === 'folder' && ` · ${t('settings.extensions.installed.fromFolder')}`}
            </span>
          </span>
          {extension.description && <span className="block">{extension.description}</span>}
          <span className="block">
            {abilities.length > 0
              ? `${t('settings.extensions.installed.canDo')}: ${abilities.join('; ')}.`
              : t('settings.extensions.installed.nothing')}
          </span>
        </>
      }
      control={
        <>
          <Switch
            checked={extension.isEnabled}
            label={t('settings.extensions.installed.enable', { name: extension.name })}
            onChange={(isEnabled) => send((api) => api.extensions.setEnabled(extension.id, isEnabled))}
          />
          <Menu
            trigger={
              <IconButton label={t('settings.extensions.installed.more', { name: extension.name })}>
                <Ellipsis size={16} />
              </IconButton>
            }
            items={[
              {
                label: t('settings.extensions.installed.options'),
                onSelect: () => send((api) => api.extensions.openOptions(extension.id)),
              },
              { label: t('settings.extensions.installed.remove'), isDestructive: true, onSelect: onRemove },
            ]}
          />
        </>
      }
    />
  );
}
