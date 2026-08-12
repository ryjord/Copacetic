// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Note, OutlineButton, RowAction, RowList, RowValue, Section } from '@/components/surfaces/settings/controls';

// Utils
import { ask, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { VaultState } from '../../../../electron/shared/types';

const NOTHING_SAVED: VaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };

export function PasswordsPane() {
  const [vault, setVault] = useState<VaultState>(NOTHING_SAVED);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    void ask((api) => api.vault.list(), NOTHING_SAVED).then(setVault);
  }, []);

  useEffect(refresh, [refresh]);

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
    send((api) => api.vault.remove(id));
    setTimeout(refresh, 60);
  };

  return (
    <>
      <Section title="Passwords">
        <Note>
          Saved on this machine and encrypted with a key your operating system keeps. Copacetic does not fill them in
          yet — that comes next — so for now this is somewhere to put them and read them back.
        </Note>

        <VaultCondition vault={vault} />

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

                {entry.isReadable ? (
                  <RowAction
                    label={revealed[entry.id] === undefined ? 'Show' : 'Hide'}
                    onClick={() => reveal(entry.id)}
                  />
                ) : (
                  <span className="label shrink-0 text-caution">Unreadable</span>
                )}
                <RowAction label="Remove" onClick={() => remove(entry.id)} />
              </li>
            ))}
          </RowList>
        )}
      </Section>
    </>
  );
}

/**
 * An empty vault and a vault that cannot be decrypted are different things, and
 * showing the second as the first tells someone their passwords are gone. This
 * is the only place that difference is visible to them.
 */
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
      <OutlineButton onClick={save} disabled={!origin.trim() || !password}>
        Save password
      </OutlineButton>
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
