'use client';

import { cn } from '@/lib/utils';

/**
 * Renaming something where it is shown.
 *
 * A native menu cannot hold a text field, so anything renamed from one has to
 * offer the field itself; and a field that floats over the page cannot be seen
 * at all, because a WebContentsView paints above the chrome's HTML. What is
 * left is editing the label in place, which both the tab strip and the bookmark
 * tree do — identically, and for the same reasons, so they do it from here.
 *
 * The three rules are the whole component:
 *
 * - The name arrives selected, so typing replaces it rather than appending to
 *   it. A new group is called "Group" and a new folder "Folder"; neither is a
 *   name anyone means to keep.
 * - Leaving keeps what was typed. Clicking away from a field you have edited
 *   means you are done with it, not that you changed your mind.
 * - Escape keeps the old name, and puts it back in the field before the blur
 *   that follows can save the typing.
 */
export function InlineRenameField({
  value,
  label,
  onCommit,
  onCancel,
  className,
  maxLength = 60,
}: {
  /** The name as it stands. Uncontrolled from here: the field owns what is typed. */
  value: string;
  /** What this renames, for anyone who cannot see which field opened. */
  label: string;
  /** Given the new name, only when it is different and not empty. */
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
  maxLength?: number;
}) {
  return (
    <input
      defaultValue={value}
      autoFocus
      maxLength={maxLength}
      aria-label={`Rename ${label}`}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim();
        if (next && next !== value) {
          onCommit(next);
        }
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.currentTarget.value = value;
          onCancel();
        }
      }}
      className={cn(
        'min-w-0 rounded-[4px] border border-line-strong bg-base text-ink outline-none',
        className ?? 'h-5 px-1 text-[11.5px]',
      )}
    />
  );
}
