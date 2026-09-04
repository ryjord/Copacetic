// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import {
  Answer,
  Note,
  OutlineButton,
  RowAction,
  RowList,
  RowValue,
  Section,
} from '@/components/settings/shared/controls';

// Utils
import { ask } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { VaultFacts, VaultLock, VaultState } from '@shared/types';

const NOTHING_SAVED: VaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };
const OPEN: VaultLock = { isUnlocked: true, method: 'none', detail: '' };
const NO_FACTS: VaultFacts = {
  filePath: '',
  hasKeychain: false,
  canAskWhoYouAre: false,
  isSigned: false,
  entryCount: 0,
};

export function PasswordsPane() {
  const [vault, setVault] = useState<VaultState>(NOTHING_SAVED);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [lockState, setLockState] = useState<VaultLock>(OPEN);
  const [facts, setFacts] = useState<VaultFacts>(NO_FACTS);

  const refresh = useCallback(() => {
    void ask((api) => api.vault.list(), NOTHING_SAVED).then(setVault);
    void ask((api) => api.vault.lockState(), OPEN).then(setLockState);
    void ask((api) => api.vault.facts(), NO_FACTS).then(setFacts);
  }, []);

  useEffect(refresh, [refresh]);

  // Auto-lock fires on its own timer in the main process, so this polls rather than going stale.
  useEffect(() => {
    const interval = setInterval(() => {
      void ask((api) => api.vault.lockState(), OPEN).then((next) => {
        setLockState(next);
        if (!next.isUnlocked) {
          setRevealed({});
        }
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const reveal = (id: string) => {
    if (revealed[id] !== undefined) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    void ask((api) => api.vault.reveal(id), null).then((password) => {
      setRevealed((current) => ({ ...current, [id]: password ?? '' }));
    });
  };

  const remove = (id: string) => {
    // The answer is shown rather than dropped: refusing quietly is how a button
    // becomes something that looks broken.
    void ask((api) => api.vault.remove(id), null).then((result) => {
      setMessage(result ? result.error : '');
      setTimeout(refresh, 60);
    });
  };

  return (
    <>
      <Section title="Passwords">
        <Note>
          Saved on this machine and encrypted with a key your operating system keeps. Right-click a password box and
          choose Fill password to put one in; Copacetic never offers to save what you type.
        </Note>

        <VaultCondition vault={vault} />
        <LockCondition
          lock={lockState}
          onChange={(result) => {
            setMessage(result);
            refresh();
          }}
        />

        {vault.availability !== 'unavailable' && (
          <AddPassword
            onSaved={() => {
              setMessage('');
              refresh();
            }}
            onError={setMessage}
          />
        )}
        {message && <p className="mt-2 text-[12px] text-alert">{message}</p>}
      </Section>

      <WhatThisDoesNotDo facts={facts} />

      <Section title="Taking them with you">
        <Note>
          The file is written in the format Chrome, Firefox and 1Password all read. It is{' '}
          <span className="text-caution">plain text, with every password readable in any editor</span> — that is what
          makes it portable, and why it belongs somewhere you would put a password rather than your downloads folder.
        </Note>
        <div className="flex flex-wrap gap-2">
          <OutlineButton
            onClick={() => {
              setMessage('');
              void ask((api) => api.vault.exportAll(), '').then((result) => {
                setMessage(result);
                refresh();
              });
            }}
          >
            Export passwords
          </OutlineButton>
          <OutlineButton
            onClick={() => {
              setMessage('');
              void ask((api) => api.vault.importFile(), '').then((result) => {
                setMessage(result);
                refresh();
              });
            }}
          >
            Import from a file
          </OutlineButton>
        </div>
      </Section>

      <Section title="Saved">
        {vault.entries.length === 0 ? (
          <p className="text-[12px] text-ink-faint">No passwords saved yet.</p>
        ) : (
          <RowList>
            {vault.entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <RowValue>{entry.origin}</RowValue>
                  <span className="block text-[11.5px] text-ink-faint">{entry.username || 'No username'}</span>
                </span>

                {revealed[entry.id] !== undefined && (
                  <span className="shrink-0 font-mono text-[11.5px] text-ink">{revealed[entry.id] || '—'}</span>
                )}

                {entry.isReadable && lockState.isUnlocked ? (
                  <RowAction
                    label={revealed[entry.id] === undefined ? 'Show' : 'Hide'}
                    onClick={() => reveal(entry.id)}
                  />
                ) : (
                  <span className="label shrink-0 text-caution">Unreadable</span>
                )}
                {lockState.isUnlocked ? (
                  <RowAction label="Remove" onClick={() => remove(entry.id)} />
                ) : (
                  <span className="label shrink-0 text-ink-faint">Locked</span>
                )}
              </li>
            ))}
          </RowList>
        )}
      </Section>
    </>
  );
}

// Every claim is read from where the thing actually is — the rest is what a password manager is usually quiet about.
function WhatThisDoesNotDo({ facts }: { facts: VaultFacts }) {
  return (
    <Section title="What this does not protect you from">
      <dl className="space-y-3">
        <Answer question="Where are my passwords?">
          Encrypted, one at a time, in this file:{' '}
          <span className="break-all font-mono text-[11.5px] text-ink">{facts.filePath || 'not yet known'}</span>. Go
          and look — you will find the sites and usernames readable and the passwords not.
        </Answer>
        <Answer question="What is actually protecting them?">
          A key your operating system holds
          {facts.hasKeychain ? '' : ' — which this machine does not have, so nothing can be saved here at all'}. That
          is real protection against someone reading the file, and none at all against software running as you: it can
          ask the keychain for the same key. No password manager on any platform is different, and most do not say so.
        </Answer>
        <Answer question="Does locking help?">
          {facts.canAskWhoYouAre
            ? 'It stops someone at your screen, once macOS has confirmed it is you — by Touch ID or by your login password, whichever it decides to ask for. It does not protect the file.'
            : 'This machine cannot check who you are, so unlocking is one click. It stops someone reading over your shoulder and nothing else.'}
        </Answer>
        {!facts.isSigned && (
          <Answer question="Could an update lose them?">
            On macOS, yes — and this is the honest reason. These builds are not code-signed, so the system can treat
            an updated Copacetic as a different application and refuse it the keychain entry. Your entries are not
            deleted and this panel will say exactly that if it happens, but the passwords would be unreadable.
            Exporting a copy somewhere safe is the answer until a certificate is bought.
          </Answer>
        )}
        <Answer question="Does it fill passwords in for me?">
          When you ask it to, and only then. Right-click a password box and choose Fill password: Copacetic runs one
          short script in that page, once, which finds the field and sets it. Nothing is left behind — no listener, no
          global, nothing the page can call afterwards — and the script only appears in the menu on a site you have a
          password saved for.
        </Answer>
        <Answer question="Does it offer to save passwords as I type them?">
          No, and that is the half that will not change. Noticing what you type means Copacetic&apos;s code sitting in
          every page all the time, and this browser ships no such script — the fill above is run when you ask and gone
          when it returns. Saving on submit was built and then dropped for exactly that reason. You add passwords here
          yourself.
        </Answer>
        <Answer question="Does anything leave this machine?">
          No. There is no account, no syncing and no server to sync with. The only copy that ever leaves is one you
          export yourself, and that file is plain text.
        </Answer>
      </dl>
    </Section>
  );
}

// What locking is worth here, said before it is offered — calling a one-click unlock "security" is a claim this browser exists not to make.
function LockCondition({ lock, onChange }: { lock: VaultLock; onChange: (message: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className={cn('label', lock.isUnlocked ? 'text-ink-dim' : 'text-caution')}>
        {lock.isUnlocked ? 'Unlocked' : 'Locked'}
      </span>
      {lock.isUnlocked ? (
        <OutlineButton
          onClick={() => {
            void ask((api) => api.vault.lock(), undefined).then(() => onChange(''));
          }}
        >
          Lock now
        </OutlineButton>
      ) : (
        <OutlineButton
          onClick={() => {
            void ask((api) => api.vault.unlock(), '').then(onChange);
          }}
        >
          {/* Never 'Unlock with Touch ID': macOS may ask for the login password
              instead, and promising a fingerprint makes that prompt look wrong. */}
          Unlock
        </OutlineButton>
      )}
      <span className="w-full text-[12px] leading-relaxed text-ink-faint">{lock.detail}</span>
    </div>
  );
}

// An empty vault and one that cannot be decrypted are different things — this is where that difference is visible.
function VaultCondition({ vault }: { vault: VaultState }) {
  if (vault.availability === 'ready') {
    return null;
  }

  return (
    <div
      className={cn(
        'mb-3 rounded-field border px-3 py-2 text-[12px] leading-relaxed',
        vault.availability === 'unavailable' ? 'border-alert/40 text-alert' : 'border-caution/40 text-caution',
      )}
      role="status"
    >
      {vault.detail}
    </div>
  );
}

function AddPassword({ onSaved, onError }: { onSaved: () => void; onError: (message: string) => void }) {
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [revealNew, setRevealNew] = useState(false);

  const save = () => {
    void ask((api) => api.vault.add({ origin, username, password }), { error: 'Nothing was saved.' }).then(
      (result) => {
        if ('error' in result) {
          onError(result.error);
          return;
        }
        setOrigin('');
        setUsername('');
        setPassword('');
        onSaved();
      },
    );
  };

  return (
    <div className="mt-1 space-y-2">
      <Field label="Site" value={origin} onChange={setOrigin} placeholder="https://example.com" />
      <Field label="Username" value={username} onChange={setUsername} placeholder="you@example.com" />
      <Field label="Password" value={password} onChange={setPassword} type="password" />
      <div className="flex flex-wrap gap-2">
        <OutlineButton onClick={save} disabled={!origin.trim() || !password}>
          Save password
        </OutlineButton>
        {/* Generated where the random source is, and shown rather than hidden — you cannot check what you cannot see. */}
        <OutlineButton
          onClick={() => {
            void ask((api) => api.vault.generate(20), '').then((generated) => {
              if (generated) {
                setPassword(generated);
                setRevealNew(true);
              }
            });
          }}
        >
          Generate one
        </OutlineButton>
      </div>
      {revealNew && password && (
        <p className="font-mono text-[12px] text-ink-dim">
          {password} <span className="text-ink-faint">— save it before you leave this page.</span>
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[12px] text-ink-dim">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-field border border-line bg-base px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
      />
    </label>
  );
}
