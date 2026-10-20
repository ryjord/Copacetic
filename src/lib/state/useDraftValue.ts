'use client';

// Libs
import { useState } from 'react';

/**
 * A value being changed before it is saved, such as a slider mid-drag.
 *
 * The draft is kept against the value it started from, and set aside once the
 * saved value moves: clearing it on release instead would flash the old value
 * for the moment the save takes to come back.
 */
export function useDraftValue(saved: number): [number, (draft: number) => void] {
  const [draft, setDraft] = useState<{ value: number; startedFrom: number } | null>(null);
  const shown = draft?.startedFrom === saved ? draft.value : saved;
  return [shown, (value: number) => setDraft({ value, startedFrom: saved })];
}
