'use client';

// Libs
import { useId, useState } from 'react';

// Components
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { t } from '@shared/i18n/translate';
import { isPageNavigableUrl, resolveOmniboxInput } from '@shared/browsing/url';
import { WITHOUT_KEYWORDS } from '@shared/browsing/search-engines';

interface PageAddressFieldProps {
  value: string | null;
  label: string;
  /** With the address as the address bar would read it. */
  onChange: (address: string) => void;
}

/** An address typed as it would be in the address bar, saved on Enter or on leaving the field, and only if it is one. */
export function PageAddressField({ value, label, onChange }: PageAddressFieldProps) {
  const [typed, setTyped] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const problemId = useId();

  const commit = () => {
    if (typed === null) {
      return;
    }
    const resolved = resolveOmniboxInput(typed, WITHOUT_KEYWORDS);
    if (resolved?.type !== 'url' || !isPageNavigableUrl(resolved.target)) {
      setProblem(t('settings.general.startup.notAnAddress'));
      return;
    }
    setProblem('');
    setTyped(null);
    onChange(resolved.target);
  };

  return (
    <div className="flex flex-col gap-1">
      <TextField
        value={typed ?? value ?? ''}
        spellCheck={false}
        placeholder="example.com"
        aria-label={label}
        aria-invalid={problem !== ''}
        aria-describedby={problem ? problemId : undefined}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
        className="h-7 w-72"
      />
      {problem && (
        <div id={problemId} role="alert" className="text-body text-alert">
          {problem}
        </div>
      )}
    </div>
  );
}
