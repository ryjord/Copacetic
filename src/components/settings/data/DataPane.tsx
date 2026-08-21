// Libs
import { useState } from 'react';

// Components
import { Note, OutlineButton, Section } from '@/components/settings/shared/controls';

// Utils
import { ask, send } from '@/lib/bridge';

// Types
import type { ClearRange, ExportKind } from '@shared/types';

const CLEAR_RANGES: { range: ClearRange; label: string }[] = [
  { range: 'hour', label: 'Last hour' },
  { range: 'day', label: 'Last 24 hours' },
  { range: 'week', label: 'Last 7 days' },
  { range: 'all', label: 'Everything' },
];

const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: 'bookmarks', label: 'Export bookmarks' },
  { kind: 'history', label: 'Export history' },
];

export function DataPane() {
  return (
    <>
      <Section title="Browsing data">
        <Note>
          History older than 90 days is dropped automatically. Clearing everything also empties cookies, site storage
          and the cache.
        </Note>
        <div className="flex flex-wrap gap-2">
          {CLEAR_RANGES.map((option) => (
            <OutlineButton
              key={option.range}
              tone={option.range === 'all' ? 'alert' : 'neutral'}
              onClick={() => send((api) => api.history.clear(option.range))}
            >
              Clear {option.label.toLowerCase()}
            </OutlineButton>
          ))}
        </div>
      </Section>

      <Section title="Your data">
        <ExportPanel />
      </Section>

      <Section title="Bringing data in">
        <Note>
          Reads the bookmarks file any browser exports — Chrome, Firefox, Safari, Edge. Only ordinary web addresses
          are imported: a bookmarklet or a path on this machine is refused and counted, because an exported file is
          one you were given rather than one you wrote.
        </Note>
        <ImportPanel />
      </Section>
    </>
  );
}

function ExportPanel() {
  const [message, setMessage] = useState('');

  const exportData = (kind: ExportKind) => {
    setMessage('');
    void ask((api) => api.data.export(kind), '').then(setMessage);
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-ink-faint">
        Bookmarks are written in the standard format every browser imports. History is plain JSON, readable in any
        text editor. Nothing leaves this machine unless you put it somewhere else.
      </p>
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map((option) => (
          <OutlineButton key={option.kind} onClick={() => exportData(option.kind)}>
            {option.label}
          </OutlineButton>
        ))}
      </div>
      {message && <p className="text-[12px] text-alert">{message}</p>}
    </div>
  );
}

function ImportPanel() {
  const [message, setMessage] = useState('');

  return (
    <div className="space-y-3">
      <OutlineButton
        onClick={() => {
          setMessage('');
          void ask((api) => api.data.importBookmarks(), '').then(setMessage);
        }}
      >
        Import bookmarks
      </OutlineButton>
      {message && <p className="text-[12px] text-ink-dim">{message}</p>}
    </div>
  );
}
