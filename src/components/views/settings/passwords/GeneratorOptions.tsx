'use client';

// Components
import { Checkbox } from '@/components/ui/Checkbox/Checkbox';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { t } from '@shared/i18n/translate';

// Types
import { MAX_LENGTH, MIN_LENGTH, type PasswordRecipe, entropyBits } from '@shared/passwords/password-generator';

const KINDS: readonly { key: keyof Omit<PasswordRecipe, 'length'>; label: string }[] = [
  { key: 'useLower', label: t('settings.passwords.generator.lowercase') },
  { key: 'useUpper', label: t('settings.passwords.generator.uppercase') },
  { key: 'useDigits', label: t('settings.passwords.generator.digits') },
  { key: 'useSymbols', label: t('settings.passwords.generator.symbols') },
];

/** What the next generated password is made of; a site that refuses symbols is the usual reason to change it. */
export function GeneratorOptions({
  value,
  onChange,
}: {
  value: PasswordRecipe;
  onChange: (recipe: PasswordRecipe) => void;
}) {
  const bits = entropyBits(value);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-body-sm text-ink-dim">
        {t('settings.passwords.generator.length')}
        <TextField
          aria-label={t('settings.passwords.generator.lengthLabel')}
          type="number"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          value={String(value.length)}
          onChange={(event) => onChange({ ...value, length: Number(event.target.value) })}
          className="w-16"
        />
      </label>
      {KINDS.map((kind) => (
        <Checkbox
          key={kind.key}
          label={kind.label}
          checked={value[kind.key]}
          onChange={(isChosen) => onChange({ ...value, [kind.key]: isChosen })}
        />
      ))}
      <span className="text-body-sm text-ink-faint">
        {bits > 0
          ? t('settings.passwords.generator.strength', { bits })
          : t('settings.passwords.generator.chooseOne')}
      </span>
    </div>
  );
}
