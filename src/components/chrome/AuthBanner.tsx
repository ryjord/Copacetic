'use client';

import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AuthPrompt } from '../../../electron/shared/types';
import { send } from '@/lib/bridge';

/** The prompt for HTTP authentication — the challenge intranets, routers, NAS boxes and plenty of dev servers use, and which Copacetic previously left unanswered so those sites simply failed to load. */
export function AuthBanner({ prompt }: { prompt: AuthPrompt }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
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
      className="animate-rise shrink-0 border-b border-line bg-raised px-3 py-2.5"
      aria-label="Sign in"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2">
        <KeyRound size={13} className="shrink-0 text-ink-dim" />

        <p className="min-w-0 flex-1 text-[12.5px] text-ink-dim">
          <span className="font-mono text-ink">{prompt.host}</span>
          {prompt.isProxy ? ' — the proxy for this network — asks you to sign in.' : ' asks you to sign in.'}
          {/*
            Server-chosen text inside Copacetic's own window. Quoted and
            attributed so a realm reading "enter your Google password" is
            plainly the site talking, not the browser.
          */}
          {prompt.realm && <span className="text-ink-faint"> The site says: “{prompt.realm}”.</span>}
        </p>

        <input
          ref={usernameRef}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Username"
          aria-label="Username"
          className="h-7 w-36 rounded-field border border-line bg-sunken px-2 text-[12px] text-ink outline-none focus:border-line-strong"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="off"
          placeholder="Password"
          aria-label="Password"
          className="h-7 w-36 rounded-field border border-line bg-sunken px-2 text-[12px] text-ink outline-none focus:border-line-strong"
        />

        <button
          type="button"
          onClick={cancel}
          className="h-7 rounded-field border border-line px-2.5 text-[12px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="h-7 rounded-field border border-line-strong bg-hover px-2.5 text-[12px] text-ink transition-colors hover:bg-line-strong"
        >
          Sign in
        </button>

        <p className="w-full text-[11px] text-ink-faint">
          Sent to this site only, for this request. Copacetic does not store passwords.
        </p>
      </div>
    </form>
  );
}
