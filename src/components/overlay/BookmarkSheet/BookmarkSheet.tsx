'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Select } from '@/components/ui/Select/Select';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { useDismissLayer } from '@/lib/layers/dismissLayer';
import { t } from '@shared/i18n/translate';

// Types
import { pathOf, type BookmarkFolder } from '@shared/data/bookmark-folders';
import type { Bookmark } from '@shared/types';

const UNFILED = 'unfiled';
const close = () => send((api) => api.chrome.closeBookmarkSheet());

interface SheetEdit {
  bookmark: Bookmark;
  title: string;
  folderId: string | null;
}

/** The bookmark as the sheet now shows it, where a field left alone keeps what was saved. */
function editOf(bookmark: Bookmark, title: string | null, folderId: string | null): SheetEdit {
  const chosenFolder = folderId ?? bookmark.folderId ?? UNFILED;
  return { bookmark, title: title ?? bookmark.title, folderId: chosenFolder === UNFILED ? null : chosenFolder };
}

function save({ bookmark, title, folderId }: SheetEdit, isClosing: boolean): void {
  send(async (api) => {
    if (title !== bookmark.title) {
      await api.bookmarks.update(bookmark.id, { title });
    }
    if (folderId !== bookmark.folderId) {
      await api.bookmarks.file(bookmark.id, folderId);
    }
    if (isClosing) {
      await api.chrome.closeBookmarkSheet();
    }
  });
}

/** A bookmark just added, named and filed before it is left: the star alone saved it blind. */
export function BookmarkSheet({ bookmarkId }: { bookmarkId: string }) {
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  // What is typed is kept however the sheet goes: Escape, a click back into the page, or another tab.
  const latestEdit = useRef<SheetEdit | null>(null);
  const isSettled = useRef(false);
  useDismissLayer(true, close);

  useEffect(() => {
    let isCurrent = true;
    void Promise.all([ask((api) => api.bookmarks.list(), []), ask((api) => api.bookmarkFolders.list(), [])]).then(
      ([bookmarks, found]) => {
        if (!isCurrent) {
          return;
        }
        const saved = bookmarks.find((candidate) => candidate.id === bookmarkId) ?? null;
        // Removed elsewhere before it loaded, so there is nothing left to name or file.
        if (!saved) {
          close();
          return;
        }
        setBookmark(saved);
        setFolders(found);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [bookmarkId]);

  useEffect(() => {
    latestEdit.current = bookmark ? editOf(bookmark, title, folderId) : null;
  });

  useEffect(
    () => () => {
      const edit = latestEdit.current;
      if (edit && !isSettled.current) {
        save(edit, false);
      }
    },
    [],
  );

  if (!bookmark) {
    return null;
  }

  const options = [
    { id: UNFILED, label: t('shell.overlay.bookmarkSheet.unfiled') },
    ...folders.map((folder) => ({
      id: folder.id,
      // The whole path, since two folders in different places may share a name.
      label: pathOf(folders, folder.id)
        .map((entry) => entry.name)
        .join(' / '),
    })),
  ];
  const shownTitle = title ?? bookmark.title;
  const shownFolder = folderId ?? bookmark.folderId ?? UNFILED;

  const done = () => {
    isSettled.current = true;
    save(editOf(bookmark, title, folderId), true);
  };

  return (
    <form
      aria-label={t('shell.overlay.bookmarkSheet.label')}
      className="animate-pop flex w-80 flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-popover"
      onSubmit={(event) => {
        event.preventDefault();
        done();
      }}
    >
      <h2 className="text-reading font-semibold text-ink">{t('shell.overlay.bookmarkSheet.title')}</h2>
      <TextField
        value={shownTitle}
        aria-label={t('shell.overlay.bookmarkSheet.name')}
        onChange={(event) => setTitle(event.target.value)}
        className="h-8"
        autoFocus
      />
      <Select
        label={t('shell.overlay.bookmarkSheet.folder')}
        options={options}
        value={shownFolder}
        onChange={setFolderId}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            isSettled.current = true;
            send(async (api) => {
              await api.chrome.closeBookmarkSheet();
              await api.bookmarks.remove(bookmark.id);
            });
          }}
        >
          {t('shell.overlay.bookmarkSheet.remove')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('shell.overlay.bookmarkSheet.done')}
        </Button>
      </div>
    </form>
  );
}
