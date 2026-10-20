'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { SettingGroup } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { t } from '@shared/i18n/translate';

interface LicenceEntry {
  name: string;
  version: string;
  licence: string;
  text: string;
}

export interface LicenceFile {
  own: string;
  notice: string;
  packages: LicenceEntry[];
}

/** Written at build time from the packages that ship; read as untrusted JSON all the same. */
export function readLicenceFile(value: unknown): LicenceFile | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const own = Reflect.get(value, 'own');
  const notice = Reflect.get(value, 'notice');
  const packages: unknown = Reflect.get(value, 'packages');
  if (typeof own !== 'string' || typeof notice !== 'string' || !Array.isArray(packages)) {
    return null;
  }
  const entries = packages
    .filter((entry): entry is object => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      name: String(Reflect.get(entry, 'name') ?? ''),
      version: String(Reflect.get(entry, 'version') ?? ''),
      licence: String(Reflect.get(entry, 'licence') ?? ''),
      text: String(Reflect.get(entry, 'text') ?? ''),
    }))
    .filter((entry) => entry.name !== '');
  return { own, notice, packages: entries };
}

/** Everything Copacetic is made of that someone else wrote, each with the terms it came under. */
export function LicencesList() {
  const [file, setFile] = useState<LicenceFile | null | 'missing'>(null);

  useEffect(() => {
    void fetch('/licences.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((json: unknown) => setFile(readLicenceFile(json) ?? 'missing'))
      .catch(() => setFile('missing'));
  }, []);

  if (file === null) {
    return null;
  }
  if (file === 'missing') {
    return <p className="px-0.5 text-body-sm text-ink-dim">{t('about.licences.missing')}</p>;
  }

  return (
    <SettingGroup title={t('about.licences.heading', { count: file.packages.length })}>
      <Licence title="Copacetic" subtitle={t('about.licences.ownSubtitle')} text={file.own} />
      <Licence
        title={t('about.licences.filterLists')}
        subtitle={t('about.licences.filterListsSubtitle')}
        text={file.notice}
      />
      {file.packages.map((entry) => (
        <Licence
          key={`${entry.name}@${entry.version}`}
          title={entry.name}
          subtitle={`${entry.version} · ${entry.licence}`}
          text={entry.text || t('about.licences.noFile', { licence: entry.licence })}
        />
      ))}
    </SettingGroup>
  );
}

function Licence({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return (
    <details className="group px-3.5 py-2.5">
      <summary className="flex cursor-default list-none items-baseline justify-between gap-4 text-body text-ink">
        <span>{title}</span>
        <span className="text-body-sm text-ink-dim tabular-nums">{subtitle}</span>
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-caption text-ink-dim select-text">
        {text}
      </pre>
    </details>
  );
}
