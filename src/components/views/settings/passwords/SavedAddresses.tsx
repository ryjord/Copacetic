'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import { ADDRESS_FIELDS, type AddressEntry, type AddressFields, EMPTY_ADDRESS } from '@shared/passwords/addresses';

/** What is being written: a new address, or one already saved by its id. */
type Editing = { id: string | null; fields: AddressFields } | null;

/** Addresses kept in the vault, filled into a form from the right-click menu; the whole of one only while it is open. */
export function SavedAddresses({ isUnlocked }: { isUnlocked: boolean }) {
  const [addresses, setAddresses] = useState<AddressEntry[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(() => {
    void ask((api) => api.addresses.list(), []).then(setAddresses);
  }, []);

  useEffect(refresh, [refresh]);

  const edit = (address: AddressEntry) => {
    void ask((api) => api.addresses.fields(address.id), null).then((fields) => {
      setMessage(fields ? '' : t('settings.passwords.addresses.unlockToEdit'));
      if (fields) {
        setEditing({ id: address.id, fields });
      }
    });
  };

  const remove = (address: AddressEntry) => {
    void ask((api) => api.addresses.remove(address.id), '').then((problem) => {
      setMessage(problem);
      refresh();
    });
  };

  // Both ways resolve to a sentence to show, or nothing when it saved.
  const save = ({ id, fields }: NonNullable<Editing>) => {
    const nothingSaved = t('settings.passwords.form.nothingSaved');
    const saving =
      id === null
        ? ask((api) => api.addresses.add(fields), { error: nothingSaved }).then((result) =>
            'error' in result ? result.error : '',
          )
        : ask((api) => api.addresses.update(id, fields), nothingSaved);
    void saving.then((problem) => {
      setMessage(problem);
      if (!problem) {
        setEditing(null);
        refresh();
      }
    });
  };

  return (
    <SettingGroup
      title={t('settings.passwords.addresses.title')}
      description={t('settings.passwords.addresses.description')}
    >
      {message && (
        <div role="status">
          <SettingRow label={message} />
        </div>
      )}
      {addresses.length === 0 && !editing && <SettingRow label={t('settings.passwords.addresses.empty')} />}
      {addresses.map((address) => (
        <SettingRow
          key={address.id}
          label={address.label || t('settings.passwords.addresses.unreadable')}
          control={
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" disabled={!isUnlocked} onClick={() => edit(address)}>
                {t('settings.passwords.addresses.edit')}
              </Button>
              <Button size="sm" variant="ghost" disabled={!isUnlocked} onClick={() => remove(address)}>
                {t('settings.passwords.addresses.remove')}
              </Button>
            </div>
          }
        />
      ))}
      {editing ? (
        <AddressForm
          value={editing.fields}
          onChange={(fields) => setEditing({ ...editing, fields })}
          onSave={() => save(editing)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <SettingRow
          label={t('settings.passwords.addresses.add')}
          control={
            <Button size="sm" onClick={() => setEditing({ id: null, fields: EMPTY_ADDRESS })}>
              {t('settings.passwords.addresses.addAction')}
            </Button>
          }
        />
      )}
    </SettingGroup>
  );
}

function AddressForm({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: AddressFields;
  onChange: (fields: AddressFields) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="grid grid-cols-2 gap-2 px-3.5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {ADDRESS_FIELDS.map((field, index) => (
        <TextField
          key={field}
          aria-label={t(`settings.passwords.addresses.fields.${field}`)}
          placeholder={t(`settings.passwords.addresses.fields.${field}`)}
          value={value[field]}
          onChange={(event) => onChange({ ...value, [field]: event.target.value })}
          className={field === 'street' || field === 'name' ? 'col-span-2' : undefined}
          autoFocus={index === 0}
        />
      ))}
      <div className="col-span-2 flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          {t('settings.passwords.form.cancel')}
        </Button>
        <Button type="submit" variant="primary">
          {t('settings.passwords.form.save')}
        </Button>
      </div>
    </form>
  );
}
