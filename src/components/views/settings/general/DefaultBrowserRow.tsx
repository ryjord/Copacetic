'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { getBridge } from '@/lib/bridge';

// Types
import type { DefaultBrowserStatus } from '@shared/types';

/**
 * What this says depends on what the platform will actually allow. Windows does
 * not let an application make itself the default, so the control there opens
 * the screen where a person does it rather than claiming to have done it.
 */
const WORDING: Record<DefaultBrowserStatus, { label: string; action: string | null }> = {
  default: { label: 'Copacetic is your default browser', action: null },
  'can-ask': { label: 'Copacetic is not your default browser', action: 'Make default' },
  'settings-only': { label: 'Choose your default browser in Windows settings', action: 'Open Windows settings' },
  unavailable: { label: 'A development build cannot be the default browser', action: null },
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

  // Asked when the pane opens: the answer comes from the system, not from anything the interface knows.
  useEffect(() => {
    let isMounted = true;
    void getBridge()
      ?.app.defaultBrowserStatus()
      .then((next) => {
        if (isMounted) {
          setStatus(next);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!status) {
    return <SettingRow label="Checking the default browser" />;
  }

  const { label, action } = WORDING[status];

  const choose = async () => {
    const api = getBridge();
    if (!api) {
      return;
    }
    setMessage(await api.app.makeDefaultBrowser());
    // The system may have decided either way, so ask it rather than assume.
    await refresh();
  };

  return (
    <SettingRow
      label={label}
      help={message || undefined}
      control={
        action && (
          <Button size="sm" onClick={() => void choose()}>
            {action}
          </Button>
        )
      }
    />
  );
}
