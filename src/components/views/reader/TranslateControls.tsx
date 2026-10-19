'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Select } from '@/components/ui/Select/Select';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { blocksToTranslate, withTranslations } from '@/lib/reader/translate-article';
import { t } from '@shared/i18n/translate';
import { ENGLISH, SOURCE_LANGUAGES, TARGET_LANGUAGES, languageOf, routeFor } from '@shared/translation/languages';

// Types
import type { Article, ReaderNode } from '@/lib/reader/article';

const names = new Intl.DisplayNames(['en'], { type: 'language' });
const optionsFor = (codes: readonly string[]) =>
  codes
    .map((code) => ({ id: code, label: names.of(code) ?? code }))
    .toSorted((aLanguage, bLanguage) => aLanguage.label.localeCompare(bLanguage.label));
const SOURCE_OPTIONS = optionsFor(SOURCE_LANGUAGES);
const TARGET_OPTIONS = optionsFor(TARGET_LANGUAGES);

type Progress = { state: 'idle' } | { state: 'working' } | { state: 'failed'; message: string };

interface Props {
  article: Article;
  url: string;
  isTranslated: boolean;
  isShowingOriginal: boolean;
  onTranslated: (body: ReaderNode[]) => void;
  onShowOriginal: (isShowingOriginal: boolean) => void;
}

/** Translate the article on this machine; a language's first use downloads its model from Mozilla. */
export function TranslateControls({
  article,
  url,
  isTranslated,
  isShowingOriginal,
  onTranslated,
  onShowOriginal,
}: Props) {
  const [from, setFrom] = useState(article.language ?? ENGLISH);
  // Read once: the language the system is set to is the one most people read in.
  const [to, setTo] = useState(() => {
    const system = languageOf(navigator.language) ?? ENGLISH;
    return system === (article.language ?? ENGLISH) ? (system === ENGLISH ? 'de' : ENGLISH) : system;
  });
  const [progress, setProgress] = useState<Progress>({ state: 'idle' });
  const canTranslate = routeFor(from, to).length > 0 && progress.state !== 'working';

  const translate = async () => {
    const blocks = blocksToTranslate(article.body);
    if (blocks.length === 0) {
      return;
    }
    setProgress({ state: 'working' });
    const result = await ask((api) => api.translation.translate(from, to, blocks), {
      error: t('views.reader.translation.failed'),
    });
    if ('texts' in result) {
      onTranslated(withTranslations(article.body, result.texts, url));
      setProgress({ state: 'idle' });
    } else {
      setProgress({ state: 'failed', message: result.error });
    }
  };

  if (isTranslated) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onShowOriginal(!isShowingOriginal)}>
        {isShowingOriginal
          ? t('views.reader.translation.showTranslation')
          : t('views.reader.translation.showOriginal')}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {progress.state === 'failed' && (
        <span className="max-w-64 truncate text-body-sm text-caution" title={progress.message}>
          {progress.message}
        </span>
      )}
      <Select label={t('views.reader.translation.from')} options={SOURCE_OPTIONS} value={from} onChange={setFrom} />
      <Select label={t('views.reader.translation.into')} options={TARGET_OPTIONS} value={to} onChange={setTo} />
      <Button
        size="sm"
        disabled={!canTranslate}
        title={t('views.reader.translation.hint')}
        onClick={() => void translate()}
      >
        {progress.state === 'working'
          ? t('views.reader.translation.working')
          : t('views.reader.translation.translate')}
      </Button>
    </div>
  );
}
