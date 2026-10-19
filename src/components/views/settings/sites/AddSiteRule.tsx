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
import { PERMISSION_NAMES, originFromInput, siteOf } from '@/components/views/settings/sites/siteSettings';

// Types
import { ASKABLE_PERMISSIONS, type Settings } from '@shared/types';

type RuleKind = (typeof ASKABLE_PERMISSIONS)[number] | 'trackers';
type RuleAnswer = 'allow' | 'block';

const KINDS: readonly { id: RuleKind; label: string }[] = [
  ...ASKABLE_PERMISSIONS.map((kind) => ({ id: kind, label: PERMISSION_NAMES[kind] })),
  { id: 'trackers', label: 'Trackers' },
];
const ANSWERS: readonly { id: RuleAnswer; label: string }[] = [
  { id: 'allow', label: 'Allow' },
  { id: 'block', label: 'Block' },
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
      setProblem('That is not a web address. Try something like example.com.');
      return;
    }
    if (kind === 'trackers') {
      const site = siteOf(origin);
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
    <SettingGroup title="Add a site">
      <SettingRow
        label="Decide for a site before it asks"
        help={problem || undefined}
        control={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <TextField
              aria-label="Site address"
              placeholder="example.com"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-40"
            />
            <Select label="What to decide" options={KINDS} value={kind} onChange={setKind} />
            <Select label="Decision" options={ANSWERS} value={answer} onChange={setAnswer} />
            <Button size="sm" type="submit" disabled={!address.trim()}>
              Add
            </Button>
          </form>
        }
      />
    </SettingGroup>
  );
}
