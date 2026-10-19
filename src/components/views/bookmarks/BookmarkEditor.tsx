'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { ask } from '@/lib/bridge';

// Types
import type { Bookmark, BookmarkEditResult } from '@shared/types';

interface Props {
  bookmark: Bookmark;
  onDone: (isSaved: boolean) => void;
}

const REFUSALS: Record<Exclude<BookmarkEditResult, 'saved'>, string> = {
  'not-an-address': 'That is not an address a page can open.',
  'already-saved': 'Another bookmark already has that address.',
  missing: 'This bookmark has been removed.',
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
      aria-label={`Edit ${bookmark.title || 'bookmark'}`}
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
        Title
        <TextField value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-dim">
        Address
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
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}
