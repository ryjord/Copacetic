'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { TextField } from '@/components/ui/TextField/TextField';

// Icons
import { KeyRound } from 'lucide-react';

// Utils
import { send } from '@/lib/bridge';

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
      aria-label="Sign in"
      className="animate-pop flex w-90 flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-popover"
    >
      <div className="flex items-start gap-3">
        <KeyRound size={18} strokeWidth={1.75} className="mt-px shrink-0 text-ink-dim" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body text-ink">
            <span className="break-all font-medium">{prompt.host}</span>
            {prompt.isProxy ? ', the proxy for this network, asks you to sign in.' : ' asks you to sign in.'}
          </p>
          {/* Quoted and attributed, so a realm reading "enter your Google password" is plainly the site talking. */}
          {prompt.realm && <p className="text-body-sm text-ink-dim">The site says: “{prompt.realm}”</p>}
        </div>
      </div>
      <TextField
        ref={usernameRef}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder="Username"
        aria-label="Username"
      />
      <TextField
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        autoComplete="off"
        placeholder="Password"
        aria-label="Password"
      />
      <p className="text-caption text-ink-faint">
        Sent to this site only, for this request. Copacetic does not store passwords.
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit">
          Sign in
        </Button>
      </div>
    </form>
  );
}
