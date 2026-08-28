'use client';

// React
import { useState } from 'react';
import { createPortal } from 'react-dom';

// Icons
import { Trash2 } from 'lucide-react';

// Utils
import { send } from '@/lib/bridge';
import { useDismissLayer } from '@/lib/dismissLayer';
import { cn } from '@/lib/utils';

// Types
import { GROUP_COLOURS, claimOf, describeClaim, type GroupColourId, type TabGroup } from '@shared/tab-groups';

/**
 * Naming a group, and saying what it can honestly promise.
 *
 * Whether a group keeps its own browsing is shown here and cannot be changed:
 * it decided which session its tabs already loaded in, and turning it on now
 * would sign someone out of pages that are open in front of them.
 */
export function GroupPanel({
  group,
  holdsHush,
  anchor,
  onClose,
}: {
  group: TabGroup;
  holdsHush: boolean;
  /** Where the group's label is on screen. The panel cannot live inside the strip: it scrolls, and a box that clips one axis clips both. */
  anchor: { left: number; top: number };
  onClose: () => void;
}) {
  const [name, setName] = useState(group.name);
  useDismissLayer(true, onClose);
  const claim = claimOf(group, holdsHush);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed && trimmed !== group.name) {
      send((api) => api.groups.update(group.id, { name: trimmed }));
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={`Group ${group.name}`}
      style={{ left: anchor.left, top: anchor.top }}
      className="fixed z-50 w-[300px] overflow-hidden rounded-panel border border-line-strong bg-raised shadow-2xl"
    >
      <div className="flex flex-col gap-3 p-3.5">
        <input
          value={name}
          autoFocus
          maxLength={60}
          aria-label="Group name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => commit(name)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit(name);
              onClose();
            }
            if (event.key === 'Escape') {
              onClose();
            }
          }}
          className="h-8 w-full rounded-field border border-line bg-base px-2.5 text-[12.5px] text-ink outline-none focus:border-line-strong"
        />

        <div className="flex gap-2">
          {GROUP_COLOURS.map((colour) => (
            <button
              key={colour.id}
              type="button"
              aria-label={`Colour ${colour.id}`}
              aria-pressed={colour.id === group.colour}
              onClick={() => send((api) => api.groups.update(group.id, { colour: colour.id as GroupColourId }))}
              className={cn(
                'size-7 rounded-field',
                colour.id === group.colour && 'ring-2 ring-ink ring-offset-2 ring-offset-raised',
              )}
              style={{ background: colour.hex }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-line px-3.5 py-3">
        <p className="text-[12px] leading-relaxed text-ink-dim">{describeClaim(claim)}</p>
        {claim === 'separate' && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
            Set when the group was made, and fixed afterwards — its tabs are already loaded in that session.
          </p>
        )}
      </div>

      <div className="border-t border-line">
        <button
          type="button"
          onClick={() => {
            send((api) => api.groups.remove(group.id));
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
        >
          <Trash2 size={13} />
          Ungroup these tabs
          <span className="ml-auto text-[11.5px] text-ink-faint">Tabs stay open</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
