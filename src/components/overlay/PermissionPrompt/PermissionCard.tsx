'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Checkbox } from '@/components/ui/Checkbox/Checkbox';

// Icons
import {
  Bell,
  ClipboardPaste,
  ExternalLink,
  MapPin,
  Maximize,
  MonitorUp,
  MousePointer2,
  Music,
  Video,
  type LucideIcon,
} from 'lucide-react';

// Utils
import { send } from '@/lib/bridge';

// Types
import type { PermissionKind, PermissionPrompt } from '@shared/types';

const KIND_ICONS: Record<PermissionKind, LucideIcon> = {
  geolocation: MapPin,
  notifications: Bell,
  media: Video,
  'clipboard-read': ClipboardPaste,
  'display-capture': MonitorUp,
  midi: Music,
  pointerLock: MousePointer2,
  fullscreen: Maximize,
  openExternal: ExternalLink,
};

/**
 * Sites ask for capabilities through this, and only this.
 *
 * It never takes the keyboard: a page could ask while someone is typing, and a
 * keystroke landing on Allow would be an answer nobody gave.
 */
export function PermissionCard({ prompt }: { prompt: PermissionPrompt }) {
  const [shouldRemember, setShouldRemember] = useState(false);
  const Icon = KIND_ICONS[prompt.kind];

  const respond = (decision: 'allow' | 'deny') => {
    send((api) => api.permissions.respond(prompt.id, decision, shouldRemember));
  };

  return (
    <section
      aria-label="Permission request"
      className="animate-pop flex w-90 flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-popover"
    >
      <div className="flex items-start gap-3">
        <Icon size={18} strokeWidth={1.75} className="mt-px shrink-0 text-ink-dim" aria-hidden />
        <p className="min-w-0 text-body text-ink">
          <span className="break-all font-medium">{hostFrom(prompt.origin)}</span> wants to {prompt.description}.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={shouldRemember} onChange={setShouldRemember} label="Remember for this site" />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => respond('deny')}>
            Block
          </Button>
          <Button size="sm" onClick={() => respond('allow')}>
            Allow
          </Button>
        </div>
      </div>
    </section>
  );
}

function hostFrom(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
