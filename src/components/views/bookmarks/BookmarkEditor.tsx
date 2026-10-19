'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { Bookmark, BookmarkEditResult } from '@shared/types';

interface Props {
  bookmark: Bookmark;
  onDone: (isSaved: boolean) => void;
}

const REFUSALS: Record<Exclude<BookmarkEditResult, 'saved'>, string> = {
  'not-an-address': t('views.bookmarks.editor.notAnAddress'),
  'already-saved': t('views.bookmarks.editor.alreadySaved'),
  missing: t('views.bookmarks.editor.missing'),
};

/** A bookmark's title and address, changed where the row was. */
export function BookmarkEditor({ bookmark, onDone }: Props) {
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url);
  const [refusal, setRefusal] = useState<string | null>(null);

  const save = async () => {
    const result = await ask((api) => api.bookmarks.update(bookmark.id, { title, url }), 'missing');
    if (result === 'saved') {
      onDone(true);
      return;
    }
    setRefusal(REFUSALS[result]);
  };

  return (
    <form
      aria-label={t('views.bookmarks.editor.label', {
        name: bookmark.title || t('views.bookmarks.editor.fallbackName'),
      })}
      className="flex flex-col gap-2 rounded-sm bg-hover p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onDone(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-body-sm text-ink-dim">
        {t('views.bookmarks.editor.titleField')}
        <TextField value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-dim">
        {t('views.bookmarks.editor.addressField')}
        <TextField
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setRefusal(null);
          }}
          aria-invalid={refusal !== null}
          spellCheck={false}
        />
      </label>
      {refusal && (
        <p role="alert" className="text-body-sm text-alert">
          {refusal}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => onDone(false)}>
          {t('views.bookmarks.editor.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('views.bookmarks.editor.save')}
        </Button>
      </div>
    </form>
  );
}
