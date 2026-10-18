// Libs
import type { ReactNode } from 'react';

// Utils
import { cn } from '@/lib/utils';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line py-6 first:pt-0 last:border-b-0">
      <h2 className="label mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[12px] leading-relaxed text-ink-faint">{children}</p>;
}

export function Subheading({ children }: { children: ReactNode }) {
  return <h3 className="label mb-2">{children}</h3>;
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink-dim">{value}</dd>
    </div>
  );
}

export function Answer({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-medium text-ink">{question}</dt>
      <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">{children}</dd>
    </div>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line rounded-field border border-line">{children}</ul>;
}

export function RowValue({ children }: { children: ReactNode }) {
  return <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-dim">{children}</span>;
}

export function RowAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded px-2 py-0.5 text-[11.5px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
    >
      {label}
    </button>
  );
}

export function OutlineButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'clear' | 'caution' | 'alert';
}) {
  const tones = {
    neutral: 'border-line text-ink-dim hover:bg-raised hover:text-ink',
    clear: 'border-clear/40 text-clear hover:bg-hover',
    caution: 'border-caution/40 text-caution hover:bg-hover',
    alert: 'border-line text-alert hover:border-alert/40 hover:bg-raised',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-field border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50',
        tones[tone],
      )}
    >
      {children}
    </button>
  );
}

export function ChoiceGroup<Id extends string>({
  options,
  selected,
  onSelect,
  layout = 'row',
}: {
  options: readonly { id: Id; label: string }[];
  selected: Id;
  onSelect: (id: Id) => void;
  layout?: 'row' | 'grid';
}) {
  return (
    <div className={layout === 'grid' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'flex gap-2'}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          aria-pressed={selected === option.id}
          className={cn(
            'rounded-field border px-3 py-2 text-[12.5px] transition-colors',
            layout === 'row' ? 'flex-1' : 'text-left',
            selected === option.id
              ? 'border-line-strong bg-hover text-ink'
              : 'border-line text-ink-dim hover:bg-raised hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
