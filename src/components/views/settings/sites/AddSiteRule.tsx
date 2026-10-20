'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { TextField } from '@/components/ui/TextField/TextField';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { PERMISSION_NAMES, originFromInput } from '@/components/views/settings/sites/siteSettings';
import { siteOfOrigin } from '@shared/data/site-settings';
import { t } from '@shared/i18n/translate';

// Types
import { ASKABLE_PERMISSIONS, type Settings } from '@shared/types';

type RuleKind = (typeof ASKABLE_PERMISSIONS)[number] | 'trackers';
type RuleAnswer = 'allow' | 'block';

const KINDS: readonly { id: RuleKind; label: string }[] = [
  ...ASKABLE_PERMISSIONS.map((kind) => ({ id: kind, label: PERMISSION_NAMES[kind] })),
  { id: 'trackers', label: t('settings.sites.addRule.trackers') },
];
const ANSWERS: readonly { id: RuleAnswer; label: string }[] = [
  { id: 'allow', label: t('settings.sites.addRule.allow') },
  { id: 'block', label: t('settings.sites.addRule.block') },
];

/** A decision about a site before visiting it, rather than only when it asks. */
export function AddSiteRule({ settings }: { settings: Pick<Settings, 'permissionDecisions' | 'blockerAllowlist'> }) {
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState<RuleKind>('notifications');
  const [answer, setAnswer] = useState<RuleAnswer>('block');
  const [problem, setProblem] = useState('');

  const add = () => {
    const origin = originFromInput(address);
    if (!origin) {
      setProblem(t('settings.sites.addRule.problem'));
      return;
    }
    if (kind === 'trackers') {
      const site = siteOfOrigin(origin);
      const others = settings.blockerAllowlist.filter((entry) => entry !== site);
      updateSettings({ blockerAllowlist: answer === 'allow' ? [...others, site] : others });
    } else {
      updateSettings({
        permissionDecisions: {
          ...settings.permissionDecisions,
          [`${origin}|${kind}`]: answer === 'allow' ? 'allow' : 'deny',
        },
      });
    }
    setAddress('');
    setProblem('');
  };

  return (
    <SettingGroup title={t('settings.sites.addRule.title')}>
      <SettingRow
        label={t('settings.sites.addRule.label')}
        help={problem || undefined}
        isStacked
        control={
          <form
            className="flex w-full flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <TextField
              aria-label={t('settings.sites.addRule.address')}
              placeholder={t('settings.sites.addRule.placeholder')}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="min-w-48 flex-1"
            />
            <Select label={t('settings.sites.addRule.kind')} options={KINDS} value={kind} onChange={setKind} />
            <Select
              label={t('settings.sites.addRule.decision')}
              options={ANSWERS}
              value={answer}
              onChange={setAnswer}
            />
            <Button size="sm" type="submit" disabled={!address.trim()}>
              {t('settings.sites.addRule.add')}
            </Button>
          </form>
        }
      />
    </SettingGroup>
  );
}
