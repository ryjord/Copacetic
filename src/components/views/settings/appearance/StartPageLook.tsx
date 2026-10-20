'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { AppearancePreview, type PreviewBackground } from '@/components/views/settings/appearance/AppearancePreview';
import { Button } from '@/components/ui/Button/Button';
import { ChoiceCards } from '@/components/ui/ChoiceCards/ChoiceCards';
import { RangeSlider } from '@/components/ui/RangeSlider/RangeSlider';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { Switch } from '@/components/ui/Switch/Switch';
import { TextField } from '@/components/ui/TextField/TextField';
import { WidgetList } from '@/components/views/settings/appearance/WidgetList';

// Icons
import { ImagePlus } from 'lucide-react';

// Utils
import { ambientPreviewStyle } from '@/components/views/settings/appearance/ambientPreview';
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask } from '@/lib/bridge/bridge';
import { useDraftValue } from '@/lib/state/useDraftValue';
import { ambientHexFor, hueForAmbientHex } from '@shared/chrome/ambient';
import { t } from '@shared/i18n/translate';

// Types
import { THEME_IDS, WALLPAPER_DIM_MAX, type Settings, type ThemeId } from '@shared/types';

const THEME_LABELS: Record<ThemeId, string> = {
  deep: t('settings.appearance.startPage.colour.deep'),
  slate: t('settings.appearance.startPage.colour.slate'),
  ember: t('settings.appearance.startPage.colour.ember'),
  moss: t('settings.appearance.startPage.colour.moss'),
  dusk: t('settings.appearance.startPage.colour.dusk'),
  sand: t('settings.appearance.startPage.colour.sand'),
};

type BackgroundChoice = ThemeId | 'photo';

/** The start page: its background, colour or photo, and what it shows. */
export function StartPageLook({ settings }: { settings: Settings }) {
  const [hue, setHueDraft] = useDraftValue(settings.ambientHue);
  const [dim, setDimDraft] = useDraftValue(settings.wallpaperDim);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => {
    if (!settings.hasWallpaper) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.wallpaper.preview(), null).then((image) => {
      if (isCurrent) {
        setPhoto(image);
      }
    });
    return () => {
      isCurrent = false;
    };
    // Bumped after a replacement, which leaves hasWallpaper true and would otherwise go unnoticed.
  }, [settings.hasWallpaper, photoVersion]);

  const shownPhoto = pendingPhoto ?? (settings.hasWallpaper ? photo : null);
  const background: PreviewBackground = shownPhoto
    ? { kind: 'photo', photo: shownPhoto, dim, isBlurred: settings.wallpaperBlur }
    : { kind: 'colour', theme: settings.theme, hue };

  // Chosen in the main process's own dialog, then shown here before anything is kept.
  const choosePhoto = async () => {
    setPhotoError('');
    const failure = await ask((api) => api.wallpaper.choose(), '');
    if (failure) {
      setPhotoError(failure);
      return;
    }
    setPendingPhoto(await ask((api) => api.wallpaper.staged(), null));
  };

  const keepPhoto = async () => {
    setPhotoError(await ask((api) => api.wallpaper.keep(), ''));
    setPendingPhoto(null);
    setPhotoVersion((version) => version + 1);
  };

  const cancelPhoto = async () => {
    await ask((api) => api.wallpaper.discard(), undefined);
    setPendingPhoto(null);
  };

  const removePhoto = async () => {
    await ask((api) => api.wallpaper.remove(), undefined);
    setPhotoError(await ask((api) => api.wallpaper.keep(), ''));
  };

  const chooseBackground = async (choice: BackgroundChoice) => {
    if (choice === 'photo') {
      await choosePhoto();
      return;
    }
    // A new colour is a fresh start, not the old turn applied to different colours.
    updateSettings({ theme: choice, ambientHue: 0 });
    if (pendingPhoto) {
      await cancelPhoto();
    }
    if (settings.hasWallpaper) {
      await removePhoto();
    }
  };

  const backgroundOptions = [
    ...THEME_IDS.map((theme) => ({
      id: theme,
      label: THEME_LABELS[theme],
      preview: (
        <span
          data-ambient-preview=""
          style={ambientPreviewStyle(theme, theme === settings.theme ? hue : 0)}
          className="ambient-field block h-10 w-16"
        />
      ),
    })),
    {
      id: 'photo' as const,
      label: t('settings.appearance.startPage.background.photo'),
      preview: (
        <span className="grid h-10 w-16 place-items-center bg-hover text-ink-dim">
          <ImagePlus size={16} strokeWidth={1.75} aria-hidden />
        </span>
      ),
    },
  ];
  const chosenBackground: BackgroundChoice = settings.hasWallpaper || pendingPhoto ? 'photo' : settings.theme;

  return (
    <SettingGroup title={t('settings.appearance.startPage.title')}>
      <div className="flex flex-col gap-3 p-3.5">
        <AppearancePreview widgets={settings.startPageWidgets} background={background} />
      </div>
      <SettingRow
        label={t('settings.appearance.startPage.background.label')}
        help={photoError || undefined}
        isStacked
        control={
          <ChoiceCards
            label={t('settings.appearance.startPage.background.group')}
            options={backgroundOptions}
            value={chosenBackground}
            onChange={(choice) => void chooseBackground(choice)}
          />
        }
      />
      {pendingPhoto && (
        <SettingRow
          label={t('settings.appearance.startPage.photo.pending')}
          help={t('settings.appearance.startPage.photo.pendingHelp')}
          control={
            <>
              <Button size="sm" variant="ghost" onClick={() => void cancelPhoto()}>
                {t('settings.appearance.startPage.photo.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void keepPhoto()}>
                {t('settings.appearance.startPage.photo.keep')}
              </Button>
            </>
          }
        />
      )}
      {!shownPhoto && (
        <ShadeRow
          theme={settings.theme}
          hue={hue}
          onInput={setHueDraft}
          onChange={(ambientHue) => {
            if (ambientHue !== settings.ambientHue) {
              updateSettings({ ambientHue });
            }
          }}
        />
      )}
      {shownPhoto && (
        <>
          {settings.hasWallpaper && !pendingPhoto && (
            <SettingRow
              label={t('settings.appearance.startPage.photo.label')}
              help={t('settings.appearance.startPage.photo.help')}
              control={
                <>
                  <Button size="sm" variant="ghost" onClick={() => void removePhoto()}>
                    {t('settings.appearance.startPage.photo.remove')}
                  </Button>
                  <Button size="sm" onClick={() => void choosePhoto()}>
                    {t('settings.appearance.startPage.photo.change')}
                  </Button>
                </>
              }
            />
          )}
          <SettingRow
            label={t('settings.appearance.startPage.photo.dim')}
            control={
              <>
                <RangeSlider
                  min={0}
                  max={WALLPAPER_DIM_MAX}
                  value={dim}
                  label={t('settings.appearance.startPage.photo.dimSlider')}
                  onInput={setDimDraft}
                  onChange={(wallpaperDim) => {
                    if (wallpaperDim !== settings.wallpaperDim) {
                      updateSettings({ wallpaperDim });
                    }
                  }}
                />
                <span className="w-9 text-right text-body-sm text-ink-dim tabular-nums">{dim}%</span>
              </>
            }
          />
          <SettingRow
            label={t('settings.appearance.startPage.photo.blur')}
            help={t('settings.appearance.startPage.photo.blurHelp')}
            control={
              <Switch
                checked={settings.wallpaperBlur}
                label={t('settings.appearance.startPage.photo.blur')}
                onChange={(wallpaperBlur) => updateSettings({ wallpaperBlur })}
              />
            }
          />
        </>
      )}
      <WidgetList widgets={settings.startPageWidgets} />
    </SettingGroup>
  );
}

/**
 * One value, two ways of saying it: the slider turns the colour, and the field
 * shows where it landed. Typing a colour works out the turn that lands there,
 * so the two cannot disagree.
 */
function ShadeRow({
  theme,
  hue,
  onInput,
  onChange,
}: {
  theme: ThemeId;
  hue: number;
  onInput: (hue: number) => void;
  onChange: (hue: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? ambientHexFor(theme, hue);

  return (
    <SettingRow
      label={t('settings.appearance.startPage.shade.label')}
      control={
        <>
          <RangeSlider
            min={0}
            max={359}
            value={hue}
            label={t('settings.appearance.startPage.shade.slider')}
            onInput={(next) => {
              setTyped(null);
              onInput(next);
            }}
            onChange={onChange}
          />
          <TextField
            value={shown}
            spellCheck={false}
            aria-label={t('settings.appearance.startPage.shade.hex')}
            onChange={(event) => {
              setTyped(event.target.value);
              const turn = hueForAmbientHex(theme, event.target.value);
              if (turn !== null) {
                onChange(turn);
              }
            }}
            onBlur={() => setTyped(null)}
            className="h-7 w-24 font-mono text-body-sm"
          />
        </>
      }
    />
  );
}
