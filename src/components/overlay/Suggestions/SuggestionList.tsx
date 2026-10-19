'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';

// Icons
import { ArrowRight, Bookmark, Clock, Search } from 'lucide-react';

// Utils
import { getBridge, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { SuggestionView } from '@shared/suggestion-view';

const KIND_ICONS = {
  url: ArrowRight,
  search: Search,
  history: Clock,
  bookmark: Bookmark,
} as const;

/** What the address field would go to, drawn over the page under the field the keyboard stays in. */
export function SuggestionList() {
  const [view, setView] = useState<SuggestionView | null>(null);

  useEffect(() => getBridge()?.on.omniboxSuggestions(setView), []);

  if (!view) {
    return null;
  }

  return (
    <ul
      aria-hidden
      // The overlay starts at the page's left edge and its own padding; this lines the list up under the field.
      style={{ marginLeft: Math.max(0, view.left - 8), width: view.width }}
      className="animate-fade flex flex-col overflow-hidden rounded-lg border border-line bg-raised py-1 shadow-popover"
    >
      {view.suggestions.map((suggestion, index) => {
        const Icon = KIND_ICONS[suggestion.kind];
        return (
          <li key={suggestion.id}>
            <button
              type="button"
              tabIndex={-1}
              // On press rather than release: the press is what takes the keyboard away from the field.
              onMouseDown={(event) => {
                event.preventDefault();
                send((api) => api.omnibox.choose(suggestion.target));
              }}
              className={cn(
                'flex h-9 w-full items-center gap-3 px-3 text-left hover:bg-hover',
                index === view.highlighted && 'bg-hover',
              )}
            >
              {suggestion.faviconDataUrl ? (
                <Favicon dataUrl={suggestion.faviconDataUrl} seed={suggestion.subtitle} size={16} />
              ) : (
                <Icon size={16} strokeWidth={1.75} className="shrink-0 text-ink-faint" aria-hidden />
              )}
              <span className="min-w-0 truncate text-body text-ink">{suggestion.title}</span>
              <span className="ml-auto min-w-0 shrink truncate pl-4 text-body-sm text-ink-faint">
                {suggestion.subtitle}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
