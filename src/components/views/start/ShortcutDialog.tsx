'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { MAX_SHORTCUT_TITLE } from '@shared/data/start-tiles';
import { t } from '@shared/i18n/translate';

// Types
import type { TopSite } from '@shared/types';

interface Props {
  /** The tile being changed, or null to add a new one. */
  tile: TopSite | null;
  onClose: () => void;
  onSaved: () => void;
}

/** A start page tile's name, address and icon, which become a shortcut once saved. */
export function ShortcutDialog({ tile, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(tile?.label ?? '');
  const [address, setAddress] = useState(tile?.url ?? '');
  // A chosen picture, or null for the site's own icon.
  const [icon, setIcon] = useState<string | null>(tile?.isShortcut ? tile.faviconDataUrl : null);
  const [problem, setProblem] = useState('');

  const chooseIcon = async () => {
    const chosen = await ask((api) => api.startPage.chooseIcon(), { icon: null, problem: '' });
    setProblem(chosen.problem);
    if (chosen.icon) {
      setIcon(chosen.icon);
    }
  };

  const save = async () => {
    const answer = await ask(
      (api) => api.startPage.saveShortcut(tile?.url ?? null, { address, title, icon }),
      t('views.start.shortcut.failed'),
    );
    if (answer) {
      setProblem(answer);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      title={tile ? t('views.start.shortcut.editTitle') : t('views.start.shortcut.addTitle')}
      confirmLabel={t('views.start.shortcut.save')}
      disabled={!address.trim()}
      onConfirm={(event) => {
        // Kept open until the address is accepted, so a typo is fixed in place rather than lost.
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-3 pt-1">
        <label className="flex flex-col gap-1">
          <span className="text-body-sm text-ink-dim">{t('views.start.shortcut.name')}</span>
          <TextField
            value={title}
            maxLength={MAX_SHORTCUT_TITLE}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-body-sm text-ink-dim">{t('views.start.shortcut.address')}</span>
          <TextField
            value={address}
            spellCheck={false}
            placeholder="example.com"
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-md bg-inset shadow-[0_0_0_1px_var(--color-line)]">
            <Favicon
              dataUrl={icon ?? (tile?.isShortcut ? null : (tile?.faviconDataUrl ?? null))}
              seed={address}
              size={24}
            />
          </span>
          <Button size="sm" onClick={() => void chooseIcon()}>
            {t('views.start.shortcut.chooseIcon')}
          </Button>
          {icon && (
            <Button size="sm" variant="ghost" onClick={() => setIcon(null)}>
              {t('views.start.shortcut.siteIcon')}
            </Button>
          )}
        </div>
        {problem && <p className="text-body-sm text-caution">{problem}</p>}
      </div>
    </ConfirmDialog>
  );
}
