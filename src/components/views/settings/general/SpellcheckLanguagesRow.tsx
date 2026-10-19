'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Select } from '@/components/ui/Select/Select';
import { SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { updateSettings } from '@/components/views/settings/shared/options';
import { t } from '@shared/i18n/translate';

// Types
import type { SpellcheckChoices } from '@shared/chrome/spellcheck';

const SYSTEM = 'system';
const NONE = 'none';
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

function nameOf(code: string): string {
  try {
    return LANGUAGE_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Which dictionaries check what you type: chosen on Windows and Linux, the system's own on macOS. */
export function SpellcheckLanguagesRow({ chosen }: { chosen: readonly string[] }) {
  const [choices, setChoices] = useState<SpellcheckChoices | null>(null);

  // Asked again after a change, because what is in use is Chromium's answer, not the setting.
  useEffect(() => {
    void ask((api) => api.app.spellcheckChoices(), null).then(setChoices);
  }, [chosen]);

  if (!choices) {
    return null;
  }
  const inUse = choices.inUse.map(nameOf).join(' and ');
  if (!choices.canChoose) {
    return (
      <SettingRow
        label={t('settings.general.typing.languages.label')}
        help={
          inUse
            ? t('settings.general.typing.languages.macOsWithCurrent', { languages: inUse })
            : t('settings.general.typing.languages.macOs')
        }
      />
    );
  }

  const languages = choices.available
    .map((code) => ({ id: code, label: nameOf(code) }))
    .sort((aLanguage, bLanguage) => aLanguage.label.localeCompare(bLanguage.label));
  const [first, second] = chosen;
  const checkingIn = inUse ? `${t('settings.general.typing.languages.checkingIn', { languages: inUse })} ` : '';
  const help = `${checkingIn}${t('settings.general.typing.languages.download')}`;

  return (
    <SettingRow
      label={t('settings.general.typing.languages.label')}
      help={help}
      control={
        <>
          <Select
            label={t('settings.general.typing.languages.first')}
            options={[{ id: SYSTEM, label: t('settings.general.typing.languages.system') }, ...languages]}
            value={first ?? SYSTEM}
            onChange={(code) => updateSettings({ spellcheckLanguages: languagesAfterChoosing(code, second) })}
          />
          {first && (
            <Select
              label={t('settings.general.typing.languages.second')}
              options={[
                { id: NONE, label: t('settings.general.typing.languages.noSecond') },
                ...languages.filter((language) => language.id !== first),
              ]}
              value={second ?? NONE}
              onChange={(code) => updateSettings({ spellcheckLanguages: code === NONE ? [first] : [first, code] })}
            />
          )}
        </>
      }
    />
  );
}

/** A new first language keeps the second, unless they are now the same; the system's language clears both. */
export function languagesAfterChoosing(first: string, second: string | undefined): string[] {
  if (first === SYSTEM) {
    return [];
  }
  return second && second !== first ? [first, second] : [first];
}
