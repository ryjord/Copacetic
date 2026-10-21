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

/** Whether Copacetic offers to save a password as you sign in, and the sites it never offers on. */
export function SaveOffers() {
  const isOffering = useBrowserStore((state) => state.settings.offerToSavePasswords);
  const neverOn = useBrowserStore((state) => state.settings.neverSavePasswordsOn);
  return (
    <SettingGroup title={t('settings.passwords.offers.title')}>
      <SettingRow
        label={t('settings.passwords.offers.label')}
        help={t('settings.passwords.offers.help')}
        control={
          <Switch
            label={t('settings.passwords.offers.label')}
            checked={isOffering}
            onChange={(offerToSavePasswords) => updateSettings({ offerToSavePasswords })}
          />
        }
      />
      {neverOn.map((site) => (
        <SettingRow
          key={site}
          label={t('settings.passwords.offers.never', { site })}
          control={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                updateSettings({ neverSavePasswordsOn: neverOn.filter((neverSite) => neverSite !== site) })
              }
            >
              {t('settings.passwords.offers.offerAgain')}
            </Button>
          }
        />
      ))}
    </SettingGroup>
  );
}
