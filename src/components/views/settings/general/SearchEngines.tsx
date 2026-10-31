'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { TextField } from '@/components/ui/TextField/TextField';

// Icons
import { X } from 'lucide-react';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { t } from '@shared/i18n/translate';
import {
  MAX_CUSTOM_SEARCH_ENGINES,
  MAX_ENGINE_KEYWORD,
  MAX_ENGINE_NAME,
  SEARCH_ENGINE_OPTIONS,
  isBuiltInEngine,
  problemWithEngine,
  type EngineProblem,
} from '@shared/browsing/search-engines';

// Types
import type { CustomSearchEngine, SearchEngineChoice } from '@shared/types';

const PROBLEMS: Record<EngineProblem, string> = {
  name: t('settings.general.search.custom.problems.name'),
  keyword: t('settings.general.search.custom.problems.keyword'),
  keywordTaken: t('settings.general.search.custom.problems.keywordTaken'),
  template: t('settings.general.search.custom.problems.template'),
};

const EMPTY_DRAFT = { name: '', keyword: '', searchTemplate: '' };

/** The default engine, and the ones someone added with a keyword to reach each. */
export function SearchEngines({
  searchEngine,
  customSearchEngines,
}: {
  searchEngine: SearchEngineChoice;
  customSearchEngines: CustomSearchEngine[];
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [problem, setProblem] = useState<EngineProblem | null>(null);

  const options = [
    ...SEARCH_ENGINE_OPTIONS.map((engine) => ({ id: engine.id, label: engine.name })),
    ...customSearchEngines.map((engine) => ({ id: engine.id, label: engine.name })),
  ];

  const add = () => {
    const found = problemWithEngine(draft, customSearchEngines);
    setProblem(found);
    if (found) {
      return;
    }
    const engine: CustomSearchEngine = {
      id: `custom-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
      name: draft.name.trim(),
      keyword: draft.keyword.trim().toLowerCase(),
      searchTemplate: draft.searchTemplate.trim(),
    };
    updateSettings({ customSearchEngines: [...customSearchEngines, engine] });
    setDraft(EMPTY_DRAFT);
  };

  const remove = (engine: CustomSearchEngine) => {
    // The default goes back to a built-in one rather than pointing at an engine that no longer exists.
    const isDefault = engine.id === searchEngine;
    updateSettings({
      customSearchEngines: customSearchEngines.filter((other) => other.id !== engine.id),
      ...(isDefault ? { searchEngine: 'brave' } : {}),
    });
  };

  return (
    <SettingGroup title={t('settings.general.search.title')}>
      <SettingRow
        label={t('settings.general.search.engine.label')}
        help={t('settings.general.search.engine.help')}
        control={
          <Select
            label={t('settings.general.search.engine.label')}
            options={options}
            value={searchEngine}
            onChange={(next) => {
              const chosen = isBuiltInEngine(next)
                ? next
                : customSearchEngines.find((engine) => engine.id === next)?.id;
              if (chosen) {
                updateSettings({ searchEngine: chosen });
              }
            }}
          />
        }
      />
      {customSearchEngines.map((engine) => (
        <SettingRow
          key={engine.id}
          label={engine.name}
          help={t('settings.general.search.custom.keywordHelp', { keyword: engine.keyword })}
          control={
            <IconButton
              label={t('settings.general.search.custom.remove', { name: engine.name })}
              onClick={() => remove(engine)}
            >
              <X size={16} />
            </IconButton>
          }
        />
      ))}
      {customSearchEngines.length < MAX_CUSTOM_SEARCH_ENGINES && (
        <SettingRow
          label={t('settings.general.search.custom.add')}
          help={
            problem ? (
              <span role="alert" className="text-alert">
                {PROBLEMS[problem]}
              </span>
            ) : (
              t('settings.general.search.custom.addHelp')
            )
          }
          isStacked
          control={
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                add();
              }}
            >
              <TextField
                value={draft.name}
                placeholder={t('settings.general.search.custom.name')}
                aria-label={t('settings.general.search.custom.name')}
                maxLength={MAX_ENGINE_NAME}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="h-7 w-36"
              />
              <TextField
                value={draft.keyword}
                placeholder={t('settings.general.search.custom.keyword')}
                aria-label={t('settings.general.search.custom.keyword')}
                maxLength={MAX_ENGINE_KEYWORD}
                spellCheck={false}
                onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
                className="h-7 w-24"
              />
              <TextField
                value={draft.searchTemplate}
                placeholder="https://example.com/search?q=%s"
                aria-label={t('settings.general.search.custom.template')}
                spellCheck={false}
                onChange={(event) => setDraft({ ...draft, searchTemplate: event.target.value })}
                className="h-7 min-w-64 flex-1"
              />
              <Button size="sm" type="submit">
                {t('settings.general.search.custom.action')}
              </Button>
            </form>
          }
        />
      )}
    </SettingGroup>
  );
}
