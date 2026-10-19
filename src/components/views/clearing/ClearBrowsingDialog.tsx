'use client';

// Libs
import { useState } from 'react';

// Components
import { Checkbox } from '@/components/ui/Checkbox/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';

// Utils
import { CLEAR_RANGES, clearTitle } from '@/lib/clearing';

// Types
import { type ClearChoice, choosesNothing, defaultClearChoice } from '@shared/clearing';
import type { ClearRange } from '@shared/types';

interface ClearBrowsingDialogProps {
  range: ClearRange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: ClearChoice) => void;
}

/** Asks what to clear as well as whether, and is plain that only history can be cleared by time. */
export function ClearBrowsingDialog({ range, open, onOpenChange, onConfirm }: ClearBrowsingDialogProps) {
  const [choice, setChoice] = useState<ClearChoice>(() => defaultClearChoice(range));
  const rangeLabel = CLEAR_RANGES.find((option) => option.id === range)?.label.toLowerCase() ?? '';
  const choose = (part: keyof ClearChoice) => (isChosen: boolean) => setChoice({ ...choice, [part]: isChosen });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={clearTitle(range)}
      confirmLabel="Clear"
      isDestructive
      disabled={choosesNothing(choice)}
      onConfirm={() => onConfirm(choice)}
    >
      <div className="flex flex-col gap-2.5">
        <Checkbox label={`History from ${rangeLabel}`} checked={choice.history} onChange={choose('history')} />
        <Checkbox
          label="Cookies and site data, from all time. You will be signed out of sites."
          checked={choice.siteData}
          onChange={choose('siteData')}
        />
        <Checkbox label="Cached images and files, from all time" checked={choice.cache} onChange={choose('cache')} />
        <span>Groups that keep their own browsing are cleared too. Open tabs stay open.</span>
      </div>
    </ConfirmDialog>
  );
}
