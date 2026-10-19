'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { TextField } from '@/components/ui/TextField/TextField';

// Icons
import { KeyRound } from 'lucide-react';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { AuthPrompt } from '@shared/types';

/** HTTP authentication, the challenge intranets, routers, NAS boxes and dev servers use. */
export function SignInCard({ prompt }: { prompt: AuthPrompt }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  // Asked of the main process too: the overlay is a view of its own, and focus inside it means nothing until it has the keyboard.
  useEffect(() => {
    usernameRef.current?.focus();
    send((api) => api.chrome.focusOverlay());
  }, [prompt.id]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    send((api) => api.auth.respond(prompt.id, username, password));
  };

  const cancel = () => send((api) => api.auth.cancel(prompt.id));

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
      aria-label={t('shell.overlay.signInCard.label')}
      className="animate-pop flex w-90 flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-popover"
    >
      <div className="flex items-start gap-3">
        <KeyRound size={18} strokeWidth={1.75} className="mt-px shrink-0 text-ink-dim" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body text-ink">
            <span className="break-all font-medium">{prompt.host}</span>
            {prompt.isProxy ? t('shell.overlay.signInCard.proxyAsks') : ` ${t('shell.overlay.signInCard.asks')}`}
          </p>
          {/* Quoted and attributed, so a realm reading "enter your Google password" is plainly the site talking. */}
          {prompt.realm && (
            <p className="text-body-sm text-ink-dim">
              {t('shell.overlay.signInCard.realm', { realm: prompt.realm })}
            </p>
          )}
        </div>
      </div>
      <TextField
        ref={usernameRef}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder={t('shell.overlay.signInCard.username')}
        aria-label={t('shell.overlay.signInCard.username')}
      />
      <TextField
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        autoComplete="off"
        placeholder={t('shell.overlay.signInCard.password')}
        aria-label={t('shell.overlay.signInCard.password')}
      />
      <p className="text-caption text-ink-faint">{t('shell.overlay.signInCard.privacy')}</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={cancel}>
          {t('shell.overlay.signInCard.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('shell.overlay.signInCard.submit')}
        </Button>
      </div>
    </form>
  );
}
