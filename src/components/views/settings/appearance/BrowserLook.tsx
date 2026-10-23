'use client';

// Components
import { ChoiceCards } from '@/components/ui/ChoiceCards/ChoiceCards';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { Switch } from '@/components/ui/Switch/Switch';
import { HiddenFromBar } from '@/components/views/settings/appearance/HiddenFromBar';

// Icons
import { Check } from 'lucide-react';

// Utils
import { labelledOptions, updateSettings } from '@/components/views/settings/shared/options';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import {
  ACCENT_COLOURS,
  TOOLBAR_ITEMS,
  type AccentColour,
  type AppearanceId,
  type DensityId,
  type HeaderLayoutId,
  type InterfaceTextSize,
  type Settings,
  type ToolbarItemId,
} from '@shared/types';

const MODE_LABELS: Record<AppearanceId, string> = {
  system: t('settings.appearance.browser.mode.system'),
  light: t('settings.appearance.browser.mode.light'),
  dark: t('settings.appearance.browser.mode.dark'),
};
const ACCENT_LABELS: Record<AccentColour, string> = {
  blue: t('settings.appearance.browser.accent.blue'),
  indigo: t('settings.appearance.browser.accent.indigo'),
  teal: t('settings.appearance.browser.accent.teal'),
  rose: t('settings.appearance.browser.accent.rose'),
  graphite: t('settings.appearance.browser.accent.graphite'),
};
const TEXT_SIZE_LABELS: Record<InterfaceTextSize, string> = {
  small: t('settings.appearance.browser.textSize.small'),
  default: t('settings.appearance.browser.textSize.default'),
  large: t('settings.appearance.browser.textSize.large'),
  larger: t('settings.appearance.browser.textSize.larger'),
};
const DENSITY_LABELS: Record<DensityId, string> = {
  comfortable: t('settings.appearance.browser.density.comfortable'),
  compact: t('settings.appearance.browser.density.compact'),
};
const HEADER_LABELS: Record<HeaderLayoutId, string> = {
  standard: t('settings.appearance.browser.header.standard'),
  'one-line': t('settings.appearance.browser.header.oneLine'),
};
const TOOLBAR_LABELS: Record<ToolbarItemId, string> = {
  home: t('settings.appearance.browser.toolbar.home'),
  bookmarks: t('settings.appearance.browser.toolbar.bookmarks'),
  split: t('settings.appearance.browser.toolbar.split'),
  profile: t('settings.appearance.browser.toolbar.profile'),
  downloads: t('settings.appearance.browser.toolbar.downloads'),
};

/** The interface itself: light or dark, its accent, its text and how much room it takes. */
export function BrowserLook({ settings }: { settings: Settings }) {
  const modeOptions = labelledOptions(MODE_LABELS).map((option) => ({
    ...option,
    preview: <ModePreview mode={option.id} />,
  }));
  const densityOptions = labelledOptions(DENSITY_LABELS).map((option) => ({
    ...option,
    preview: <DensityPreview density={option.id} />,
  }));
  const headerOptions = labelledOptions(HEADER_LABELS).map((option) => ({
    ...option,
    preview: <HeaderPreview layout={option.id} />,
  }));

  return (
    <SettingGroup title={t('settings.appearance.browser.title')}>
      <SettingRow
        label={t('settings.appearance.browser.mode.label')}
        isStacked
        control={
          <ChoiceCards
            label={t('settings.appearance.browser.mode.label')}
            options={modeOptions}
            value={settings.appearance}
            onChange={(appearance) => updateSettings({ appearance })}
          />
        }
      />
      <SettingRow
        label={t('settings.appearance.browser.accent.label')}
        help={t('settings.appearance.browser.accent.help')}
        control={<AccentSwatches value={settings.accentColour} />}
      />
      <SettingRow
        label={t('settings.appearance.browser.textSize.label')}
        help={t('settings.appearance.browser.textSize.help')}
        control={
          <SegmentedControl
            label={t('settings.appearance.browser.textSize.label')}
            options={labelledOptions(TEXT_SIZE_LABELS)}
            value={settings.interfaceTextSize}
            onChange={(interfaceTextSize) => updateSettings({ interfaceTextSize })}
          />
        }
      />
      <SettingRow
        label={t('settings.appearance.browser.header.label')}
        help={t('settings.appearance.browser.header.help')}
        control={
          <ChoiceCards
            label={t('settings.appearance.browser.header.label')}
            options={headerOptions}
            value={settings.headerLayout}
            onChange={(headerLayout) => updateSettings({ headerLayout })}
          />
        }
      />
      <SettingRow
        label={t('settings.appearance.browser.density.label')}
        help={t('settings.appearance.browser.density.help')}
        control={
          <ChoiceCards
            label={t('settings.appearance.browser.density.label')}
            options={densityOptions}
            value={settings.density}
            onChange={(density) => updateSettings({ density })}
          />
        }
      />
      <SettingRow
        label={t('settings.appearance.browser.bookmarksBar.label')}
        help={t('settings.appearance.browser.bookmarksBar.help')}
        control={
          <Switch
            label={t('settings.appearance.browser.bookmarksBar.label')}
            checked={settings.showBookmarksBar}
            onChange={(showBookmarksBar) => updateSettings({ showBookmarksBar })}
          />
        }
      />
      <HiddenFromBar />
      <SettingRow
        label={t('settings.appearance.browser.toolbar.label')}
        help={t('settings.appearance.browser.toolbar.help')}
        isStacked
        control={<ToolbarChoices value={settings.toolbarItems} />}
      />
    </SettingGroup>
  );
}

function AccentSwatches({ value }: { value: AccentColour }) {
  const options = ACCENT_COLOURS.map((accent) => ({
    id: accent,
    label: ACCENT_LABELS[accent],
    // Its own accent rule, so the swatch shows that colour in the light or dark it will be used in.
    preview: (
      <span data-accent={accent} className="block size-6 rounded-xs" style={{ background: 'var(--accent)' }} />
    ),
  }));
  return (
    <ChoiceCards
      label={t('settings.appearance.browser.accent.label')}
      options={options}
      value={value}
      hasCaptions={false}
      onChange={(accentColour) => updateSettings({ accentColour })}
      className="gap-1.5"
    />
  );
}

/** Toggles rather than a list to tick, so what is on reads at a glance, in the order the toolbar draws them. */
function ToolbarChoices({ value }: { value: ToolbarItemId[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TOOLBAR_ITEMS.map((item) => {
        const isShown = value.includes(item);
        return (
          <button
            key={item}
            type="button"
            aria-pressed={isShown}
            onClick={() =>
              updateSettings({
                toolbarItems: isShown ? value.filter((entry) => entry !== item) : [...value, item],
              })
            }
            className={cn(
              'no-drag flex h-7 items-center gap-1.5 rounded-full border px-3 text-body-sm transition-colors',
              isShown
                ? 'border-transparent bg-accent-soft text-ink'
                : 'border-line-strong text-ink-dim hover:bg-hover hover:text-ink',
            )}
          >
            {isShown && <Check size={13} strokeWidth={2} aria-hidden />}
            {TOOLBAR_LABELS[item]}
          </button>
        );
      })}
    </div>
  );
}

const MODE_SURFACES: Record<Exclude<AppearanceId, 'system'>, { ground: string; bar: string; line: string }> = {
  light: { ground: '#eef0f2', bar: '#ffffff', line: '#d7dbe0' },
  dark: { ground: '#0e1114', bar: '#1b2026', line: '#2a3139' },
};

/** A window in each appearance; Match system is drawn half and half. */
function ModePreview({ mode }: { mode: AppearanceId }) {
  const halves = mode === 'system' ? (['light', 'dark'] as const) : ([mode] as const);
  return (
    <span className="flex h-14 w-24">
      {halves.map((half) => (
        <span
          key={half}
          className="flex flex-1 flex-col gap-1 p-1.5"
          style={{ background: MODE_SURFACES[half].ground }}
        >
          <span className="block h-2 rounded-xs" style={{ background: MODE_SURFACES[half].bar }} />
          <span className="block h-1 w-2/3 rounded-xs" style={{ background: MODE_SURFACES[half].line }} />
          <span className="block h-1 w-1/2 rounded-xs" style={{ background: MODE_SURFACES[half].line }} />
        </span>
      ))}
    </span>
  );
}

/** The tab strip and toolbar at each density's own heights, scaled down. */
function HeaderPreview({ layout }: { layout: HeaderLayoutId }) {
  const tab = <span className="block h-2 w-4 rounded-xs bg-hover" />;
  const field = <span className="block h-2.5 flex-1 rounded-xs bg-raised" />;
  return (
    <span className="flex w-24 flex-col gap-0.5 bg-ground p-1.5">
      {layout === 'one-line' ? (
        <span className="flex items-center gap-0.5">
          {field}
          {tab}
          {tab}
        </span>
      ) : (
        <>
          <span className="flex gap-0.5">
            {tab}
            {tab}
          </span>
          <span className="flex">{field}</span>
        </>
      )}
      <span className="block h-3 rounded-xs bg-sunken" />
    </span>
  );
}

function DensityPreview({ density }: { density: DensityId }) {
  const isCompact = density === 'compact';
  return (
    <span className="flex w-24 flex-col gap-0.5 bg-ground p-1.5">
      <span className={cn('block rounded-xs bg-hover', isCompact ? 'h-2' : 'h-3')} />
      <span className={cn('block rounded-xs bg-raised', isCompact ? 'h-2.5' : 'h-3.5')} />
    </span>
  );
}
