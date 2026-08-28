'use client';

// React
import { useCallback, useEffect, useState } from 'react';

// Components
import { Note, OutlineButton } from '@/components/settings/shared/controls';

// Utils
import { getBridge } from '@/lib/bridge';

// Types
import type { DefaultBrowserStatus } from '@shared/types';

/**
 * What this says depends on what the platform will actually allow. Windows does
 * not let an application make itself the default at all, so the control there
 * opens the screen where a person does it themselves rather than claiming to
 * have done something it cannot.
 */
const WORDING: Record<DefaultBrowserStatus, { note: string; action: string | null }> = {
  default: { note: 'Copacetic opens links from other applications.', action: null },
  'can-ask': {
    note: 'Links from other applications open somewhere else at the moment.',
    action: 'Make Copacetic the default',
  },
  'settings-only': {
    note: 'Windows only lets you choose a default browser yourself, in its own settings.',
    action: 'Open Windows settings',
  },
  unavailable: { note: 'A development build cannot be made the default browser.', action: null },
};

export function DefaultBrowserRow() {
  const [status, setStatus] = useState<DefaultBrowserStatus | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const api = getBridge();
    if (api) {
      setStatus(await api.app.defaultBrowserStatus());
    }
  }, []);

  // Asked once when the pane opens. The answer comes from the system rather
  // than from anything the interface already knows.
  useEffect(() => {
    let stillMounted = true;
    const api = getBridge();
    void api?.app.defaultBrowserStatus().then((next) => {
      if (stillMounted) {
        setStatus(next);
      }
    });
    return () => {
      stillMounted = false;
    };
  }, []);

  if (!status) {
    return null;
  }

  const { note, action } = WORDING[status];

  const choose = async () => {
    const api = getBridge();
    if (!api) {
      return;
    }
    setMessage(await api.app.makeDefaultBrowser());
    // The system may have decided in either direction, so ask it rather than assume.
    await refresh();
  };

  return (
    <div className="space-y-2.5">
      <Note>{note}</Note>
      {action && <OutlineButton onClick={() => void choose()}>{action}</OutlineButton>}
      {message && <Note>{message}</Note>}
    </div>
  );
}
