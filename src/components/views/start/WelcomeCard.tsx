'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask, send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { DefaultBrowserStatus } from '@shared/types';

/**
 * A new profile's start page, until it is put away: the three things worth
 * doing first, each one press. Everything here is also in Settings, so putting
 * it away loses nothing.
 */
export function WelcomeCard() {
  const [defaultStatus, setDefaultStatus] = useState<DefaultBrowserStatus>('unavailable');
  const [defaultMessage, setDefaultMessage] = useState('');

  useEffect(() => {
    void ask((api) => api.app.defaultBrowserStatus(), 'unavailable').then(setDefaultStatus);
  }, []);

  const makeDefault = () => {
    void ask((api) => api.app.makeDefaultBrowser(), '').then(async (message) => {
      setDefaultMessage(message);
      setDefaultStatus(await ask((api) => api.app.defaultBrowserStatus(), 'unavailable'));
    });
  };

  const canMakeDefault = defaultStatus === 'can-ask' || defaultStatus === 'settings-only';

  return (
    <section
      aria-labelledby="welcome-title"
      className="flex w-full flex-col gap-4 rounded-lg border border-line bg-raised/85 p-5 shadow-popover backdrop-blur-xl"
    >
      <h2 id="welcome-title" className="text-title font-semibold text-ink">
        {t('views.start.welcome.title')}
      </h2>
      <ul className="flex flex-col gap-3">
        <WelcomeStep
          line={t('views.start.welcome.import')}
          action={t('views.start.welcome.importAction')}
          onPress={() => send((api) => api.chrome.showPage('settings', 'data'))}
        />
        {canMakeDefault && (
          <WelcomeStep
            line={defaultMessage || t('views.start.welcome.defaultBrowser')}
            action={t('views.start.welcome.defaultBrowserAction')}
            onPress={makeDefault}
          />
        )}
        <WelcomeStep
          line={t('views.start.welcome.hush')}
          action={t('views.start.welcome.hushAction')}
          onPress={() => send((api) => api.tabs.createHush())}
        />
      </ul>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => updateSettings({ welcomeDismissed: true })}>
          {t('views.start.welcome.done')}
        </Button>
      </div>
    </section>
  );
}

function WelcomeStep({ line, action, onPress }: { line: string; action: string; onPress: () => void }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <p className="text-body text-ink-dim">{line}</p>
      <Button size="sm" variant="ghost" onClick={onPress}>
        {action}
      </Button>
    </li>
  );
}
