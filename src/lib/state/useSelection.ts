'use client';

// Libs
import { useState } from 'react';

/** Which rows of a list are selected, by id; only ids still in the list count, so a row gone takes its tick with it. */
export function useSelection(visibleIds: readonly string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const visibleSelected = visibleIds.filter((id) => selected.has(id));

  const toggle = (id: string, isSelected: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  return {
    selectedIds: visibleSelected,
    isSelected: (id: string) => selected.has(id),
    toggle,
    clear: () => setSelected(new Set()),
  };
}
