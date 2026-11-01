'use client';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { Switch } from '@/components/ui/Switch/Switch';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { t } from '@shared/i18n/translate';
import { languageName } from '@shared/translation/languages';

/** Whether Copacetic offers to translate a page in another language, and the languages it never offers. */
export function TranslationOffers() {
  const isOffering = useBrowserStore((state) => state.settings.offerPageTranslation);
  const neverFrom = useBrowserStore((state) => state.settings.neverOfferTranslationFrom);
  const label = t('settings.general.translation.offer.label');
  return (
    <SettingGroup title={t('settings.general.translation.title')}>
      <SettingRow
        label={label}
        help={t('settings.general.translation.offer.help')}
        control={
          <Switch
            label={label}
            checked={isOffering}
            onChange={(offerPageTranslation) => updateSettings({ offerPageTranslation })}
          />
        }
      />
      {neverFrom.map((language) => (
        <SettingRow
          key={language}
          label={t('settings.general.translation.never', { language: languageName(language) })}
          control={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                updateSettings({
                  neverOfferTranslationFrom: neverFrom.filter((neverLanguage) => neverLanguage !== language),
                })
              }
            >
              {t('settings.general.translation.offerAgain')}
            </Button>
          }
        />
      ))}
    </SettingGroup>
  );
}
