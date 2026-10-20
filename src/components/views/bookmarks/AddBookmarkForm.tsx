'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

/** An address saved by hand, into the folder being looked at; read as the address bar reads it. */
export function AddBookmarkForm({
  folderId,
  onDone,
}: {
  folderId: string | null;
  onDone: (isSaved: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState('');

  const save = async () => {
    const found = await ask((api) => api.bookmarks.add(title, address, folderId), '');
    if (found) {
      setProblem(found);
      return;
    }
    onDone(true);
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-md bg-inset p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <TextField
          value={title}
          placeholder={t('views.bookmarks.add.name')}
          aria-label={t('views.bookmarks.add.name')}
          onChange={(event) => setTitle(event.target.value)}
          className="h-8 w-48"
          autoFocus
        />
        <TextField
          value={address}
          placeholder="example.com"
          aria-label={t('views.bookmarks.add.address')}
          spellCheck={false}
          onChange={(event) => setAddress(event.target.value)}
          className="h-8 min-w-56 flex-1"
        />
      </div>
      {problem && <p className="text-body-sm text-alert">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          {t('views.bookmarks.add.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!address.trim()}>
          {t('views.bookmarks.add.save')}
        </Button>
      </div>
    </form>
  );
}
