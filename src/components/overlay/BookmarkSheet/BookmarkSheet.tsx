'use client';

// Libs
import { useEffect, useState } from 'react';

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

/** A bookmark just added, named and filed before it is left: the star alone saved it blind. */
export function BookmarkSheet({ bookmarkId }: { bookmarkId: string }) {
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  useDismissLayer(true, close);

  useEffect(() => {
    let isCurrent = true;
    void Promise.all([ask((api) => api.bookmarks.list(), []), ask((api) => api.bookmarkFolders.list(), [])]).then(
      ([bookmarks, found]) => {
        if (isCurrent) {
          setBookmark(bookmarks.find((candidate) => candidate.id === bookmarkId) ?? null);
          setFolders(found);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [bookmarkId]);

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
    send(async (api) => {
      if (shownTitle !== bookmark.title) {
        await api.bookmarks.update(bookmark.id, { title: shownTitle });
      }
      const target = shownFolder === UNFILED ? null : shownFolder;
      if (target !== bookmark.folderId) {
        await api.bookmarks.file(bookmark.id, target);
      }
      await api.chrome.closeBookmarkSheet();
    });
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
          onClick={() =>
            send(async (api) => {
              await api.chrome.closeBookmarkSheet();
              await api.bookmarks.remove(bookmark.id);
            })
          }
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
