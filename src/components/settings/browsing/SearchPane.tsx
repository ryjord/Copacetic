// Components
import { ChoiceGroup, Note, Section } from '@/components/settings/shared/controls';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/settings/shared/options';

// Types
import { SEARCH_ENGINE_OPTIONS } from '@shared/url';

const ENGINE_CHOICES = SEARCH_ENGINE_OPTIONS.map((engine) => ({ id: engine.id, label: engine.name }));

export function SearchPane() {
  const settings = useBrowserStore((state) => state.settings);

  return (
    <Section title="Search">
      <Note>
        Typing something that is not an address sends it here. Copacetic never contacts a search engine for
        suggestions as you type — the list under the address bar comes from your own history.
      </Note>
      <ChoiceGroup
        options={ENGINE_CHOICES}
        selected={settings.searchEngine}
        onSelect={(searchEngine) => updateSettings({ searchEngine })}
        layout="grid"
      />
    </Section>
  );
}
