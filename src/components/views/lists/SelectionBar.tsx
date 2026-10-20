'use client';

// Components
import { Button } from '@/components/ui/Button/Button';

export interface SelectionAction {
  label: string;
  onSelect: () => void;
  isDestructive?: boolean;
}

interface SelectionBarProps {
  /** What the selection is, in words: "3 selected". */
  summary: string;
  actions: readonly SelectionAction[];
  clearLabel: string;
  onClear: () => void;
}

/** What can be done to every selected row at once, shown only while something is selected. */
export function SelectionBar({ summary, actions, clearLabel, onClear }: SelectionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={summary}
      className="flex flex-wrap items-center gap-2 rounded-md bg-accent-soft px-3 py-2"
    >
      <span role="status" className="flex-1 text-body font-semibold text-ink">
        {summary}
      </span>
      {actions.map((action) => (
        <Button
          key={action.label}
          size="sm"
          variant={action.isDestructive ? 'danger' : 'secondary'}
          onClick={action.onSelect}
        >
          {action.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={onClear}>
        {clearLabel}
      </Button>
    </div>
  );
}
