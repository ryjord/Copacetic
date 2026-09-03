'use client';

// React
import { useEffect, useState } from 'react';

// Icons
import { ChevronDown, Folder, Inbox, List, Plus } from 'lucide-react';

// Utils
import { InlineRenameField } from '@/components/ui/controls/InlineRenameField';
import { getBridge, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import { type BookmarkFolder, countIn, visibleTree, wouldCycle } from '@shared/bookmark-folders';
import { colourOf } from '@shared/tab-groups';
import type { Bookmark } from '@shared/types';

/** What the sidebar can be pointed at. Two of them are not folders. */
export type FolderSelection = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; id: string };

/** The kinds a row will accept, named so a dragover can judge a drop it cannot yet read. */
export const DRAG_BOOKMARK = 'application/x-copacetic-bookmark';
export const DRAG_FOLDER = 'application/x-copacetic-folder';

export function FolderTree({
  folders,
  bookmarks,
  selection,
  onSelect,
  onChanged,
}: {
  folders: readonly BookmarkFolder[];
  bookmarks: readonly Bookmark[];
  selection: FolderSelection;
  onSelect: (next: FolderSelection) => void;
  onChanged: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // The native menu cannot hold a text field, so renaming is asked for from
  // there and answered here — the same arrangement a tab group already uses.
  useEffect(() => {
    const api = getBridge();
    return api?.on.renameBookmarkFolder((id) => setRenamingId(id));
  }, []);

  const unfiled = bookmarks.filter((bookmark) => bookmark.folderId === null).length;

  /**
   * Whether a row will take what is being dragged over it.
   *
   * A dragover cannot read what it is carrying — only the kinds it declares —
   * so a folder move is judged by kind here and refused precisely on drop. A
   * bookmark is always welcome anywhere.
   */
  const accepts = (event: React.DragEvent, folderId: string | null) => {
    if (event.dataTransfer.types.includes(DRAG_BOOKMARK)) {
      return true;
    }
    if (!event.dataTransfer.types.includes(DRAG_FOLDER)) {
      return false;
    }
    // What is being dragged cannot be read from the event mid-drag — only the
    // kinds it declares — so it is remembered when the drag starts. Without it
    // a folder dragged onto its own child was shown as an accepted drop and
    // then silently did nothing, which is worse than refusing it.
    if (!draggingId) {
      return true;
    }
    return draggingId !== folderId && !wouldCycle(folders, draggingId, folderId);
  };

  const handleDrop = (event: React.DragEvent, folderId: string | null) => {
    event.preventDefault();
    setDropTarget(null);
    setDraggingId(null);

    const bookmarkId = event.dataTransfer.getData(DRAG_BOOKMARK);
    if (bookmarkId) {
      send((api) => api.bookmarks.file(bookmarkId, folderId));
      onChanged();
      return;
    }

    const draggedFolder = event.dataTransfer.getData(DRAG_FOLDER);
    // Refused rather than accepted and quietly undone: a folder inside itself
    // detaches from the top level, so there is nowhere left to drag it back from.
    if (draggedFolder && draggedFolder !== folderId && !wouldCycle(folders, draggedFolder, folderId)) {
      send((api) => api.bookmarkFolders.move(draggedFolder, folderId));
      onChanged();
    }
  };

  const rowClasses = (isSelected: boolean, isDropTarget: boolean) =>
    cn(
      'group flex h-8 w-full items-center gap-2 rounded-md pr-2 text-[12.5px] transition-colors',
      isSelected ? 'bg-active/45 text-ink' : 'text-ink-dim hover:bg-hover',
      isDropTarget && 'outline outline-1 outline-line-strong',
    );

  return (
    <div className="flex w-60 shrink-0 flex-col gap-0.5 border-r border-line py-3 pl-3 pr-2">
      <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Folders</p>

      <button
        type="button"
        onClick={() => onSelect({ kind: 'all' })}
        onDragOver={(event) => event.dataTransfer.types.includes(DRAG_BOOKMARK) && event.preventDefault()}
        onDrop={(event) => handleDrop(event, null)}
        className={cn(rowClasses(selection.kind === 'all', false), 'pl-2')}
      >
        <List size={13} className="shrink-0" />
        <span className="flex-1 truncate text-left">All bookmarks</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">{bookmarks.length}</span>
      </button>

      {visibleTree(folders).map(({ folder, depth, hasChildren }) => {
        const counted = countIn(bookmarks, folders, folder.id);
        const isSelected = selection.kind === 'folder' && selection.id === folder.id;
        const colour = colourOf(folder.colour);

        return (
          <div
            key={folder.id}
            onDragOver={(event) => {
              if (accepts(event, folder.id)) {
                event.preventDefault();
                setDropTarget(folder.id);
              }
            }}
            onDragLeave={() => setDropTarget((current) => (current === folder.id ? null : current))}
            onDrop={(event) => handleDrop(event, folder.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              send((api) => api.bookmarkFolders.openContextMenu(folder.id));
            }}
            className={rowClasses(isSelected, dropTarget === folder.id)}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {hasChildren ? (
              <button
                type="button"
                aria-label={folder.collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
                onClick={() => send((api) => api.bookmarkFolders.update(folder.id, { collapsed: !folder.collapsed }))}
                className="shrink-0 rounded text-ink-faint transition-colors hover:text-ink"
              >
                <ChevronDown size={11} className={cn('transition-transform', folder.collapsed && '-rotate-90')} />
              </button>
            ) : (
              <span className="w-[11px] shrink-0" aria-hidden />
            )}

            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: colour }} />

            {renamingId === folder.id ? (
              <InlineRenameField
                value={folder.name}
                label={folder.name}
                className="h-5 flex-1 px-1 text-[12px]"
                onCommit={(next) => {
                  send((api) => api.bookmarkFolders.update(folder.id, { name: next }));
                  onChanged();
                }}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_FOLDER, folder.id);
                  setDraggingId(folder.id);
                }}
                onDragEnd={() => setDraggingId(null)}
                // Selecting and renaming are both a click on the same word, so
                // the second click renames — the first has to be free to say
                // which folder is being looked at.
                onClick={() => (isSelected ? setRenamingId(folder.id) : onSelect({ kind: 'folder', id: folder.id }))}
                title={`${folder.name} — click to open, click again to rename, right-click for more`}
                className="min-w-0 flex-1 truncate text-left"
              >
                {folder.name}
              </button>
            )}

            <span className="shrink-0 font-mono text-[11px] text-ink-faint">{counted.withDescendants}</span>
          </div>
        );
      })}

      <div className="my-2 h-px bg-line" />

      <button
        type="button"
        onClick={() => onSelect({ kind: 'unfiled' })}
        onDragOver={(event) => event.dataTransfer.types.includes(DRAG_BOOKMARK) && event.preventDefault()}
        onDrop={(event) => handleDrop(event, null)}
        className={cn(rowClasses(selection.kind === 'unfiled', false), 'pl-2')}
      >
        <Inbox size={13} className="shrink-0" />
        <span className="flex-1 truncate text-left">Unfiled</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">{unfiled}</span>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={async () => {
          const parentId = selection.kind === 'folder' ? selection.id : null;
          // A new folder takes the colour of the one it is made inside: the
          // colour names what a thing was filed under, and a folder inside
          // Work is still Work.
          const parent = folders.find((candidate) => candidate.id === parentId);
          const created = await getBridge()?.bookmarkFolders.create('Folder', parent?.colour ?? 'violet', parentId);
          onChanged();
          if (created) {
            setRenamingId(created.id);
          }
        }}
        className="flex h-8 items-center gap-2 rounded-md pl-2 pr-2 text-[12px] text-ink-faint transition-colors hover:bg-hover hover:text-ink-dim"
      >
        <Plus size={12} className="shrink-0" />
        <span>New folder</span>
        <Folder size={11} className="ml-auto opacity-0" aria-hidden />
      </button>
    </div>
  );
}
