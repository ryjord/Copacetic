'use client';

// Libs
import { Fragment, useEffect, useState, type ReactNode } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { SkeletonRows } from '@/components/ui/Skeleton/Skeleton';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';
import { TranslateControls } from '@/components/views/reader/TranslateControls';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { articleFrom, imagesIn, type Article, type ReaderNode } from '@/lib/reader/article';
import { updateSettings } from '@/components/views/settings/shared/options';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { ReaderStyle } from '@shared/types';

type Reading = { state: 'loading' } | { state: 'none' } | { state: 'ready'; article: Article; url: string };

const SIZE_CLASSES: Record<ReaderStyle['size'], string> = {
  small: 'text-reading',
  default: 'text-title',
  large: 'text-[19px]',
  larger: 'text-[22px]',
};
const WIDTH_CLASSES: Record<ReaderStyle['width'], string> = {
  narrow: 'max-w-[56ch]',
  default: 'max-w-[68ch]',
  wide: 'max-w-[84ch]',
};
const SIZE_OPTIONS: readonly { id: ReaderStyle['size']; label: string }[] = [
  { id: 'small', label: t('views.reader.style.small') },
  { id: 'default', label: t('views.reader.style.default') },
  { id: 'large', label: t('views.reader.style.large') },
  { id: 'larger', label: t('views.reader.style.larger') },
];
const TYPEFACE_OPTIONS: readonly { id: ReaderStyle['typeface']; label: string }[] = [
  { id: 'serif', label: t('views.reader.style.serif') },
  { id: 'sans', label: t('views.reader.style.sans') },
];
const WIDTH_OPTIONS: readonly { id: ReaderStyle['width']; label: string }[] = [
  { id: 'narrow', label: t('views.reader.style.narrow') },
  { id: 'default', label: t('views.reader.style.medium') },
  { id: 'wide', label: t('views.reader.style.wide') },
];

/** Data URLs fetched by the main process, keyed by the address the article named. */
type ImageData = Record<string, string>;

/** The page in front, without the page around its text. */
export function ReaderSurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const readerStyle = useBrowserStore((state) => state.settings.readerStyle);
  const [reading, setReading] = useState<Reading>({ state: 'loading' });
  const [images, setImages] = useState<ImageData>({});
  const [isFetchingImages, setIsFetchingImages] = useState(false);
  const [isStyling, setIsStyling] = useState(false);
  const [translated, setTranslated] = useState<ReaderNode[] | null>(null);
  const [isShowingOriginal, setIsShowingOriginal] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      const document = activeTabId ? await ask((api) => api.tabs.readerDocument(activeTabId), null) : null;
      const article = document ? articleFrom(document.html, document.url) : null;
      if (!isCurrent) {
        return;
      }
      setReading(article && document ? { state: 'ready', article, url: document.url } : { state: 'none' });
      setTranslated(null);
      setIsShowingOriginal(false);
      // The text first, so reading can start while the pictures arrive.
      const wanted = article ? imagesIn(article.body) : [];
      if (activeTabId && wanted.length > 0) {
        setIsFetchingImages(true);
        const fetched = await ask((api) => api.tabs.readerImages(activeTabId, wanted), {});
        if (isCurrent) {
          setImages(fetched);
          setIsFetchingImages(false);
        }
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [activeTabId]);

  const title = reading.state === 'ready' ? reading.article.title : t('views.reader.title');

  return (
    <SurfaceShell
      title={title}
      actions={
        reading.state === 'ready' && (
          <>
            <TranslateControls
              key={reading.url}
              article={reading.article}
              url={reading.url}
              isTranslated={translated !== null}
              isShowingOriginal={isShowingOriginal}
              onTranslated={setTranslated}
              onShowOriginal={setIsShowingOriginal}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={isStyling}
              aria-label={t('views.reader.style.label')}
              onClick={() => setIsStyling(!isStyling)}
              className="font-serif"
            >
              Aa
            </Button>
            {activeTabId && (
              <Button size="sm" variant="ghost" onClick={() => send((api) => api.tabs.print(activeTabId))}>
                {t('views.reader.print')}
              </Button>
            )}
            <Button size="sm" onClick={() => setSurface('none')}>
              {t('views.reader.openOriginal')}
            </Button>
          </>
        )
      }
    >
      {isStyling && reading.state === 'ready' && (
        <div className="mx-auto flex w-full max-w-[84ch] flex-wrap items-center gap-3 px-6 pt-5">
          <SegmentedControl
            label={t('views.reader.style.size')}
            options={SIZE_OPTIONS}
            value={readerStyle.size}
            onChange={(size) => updateSettings({ readerStyle: { ...readerStyle, size } })}
          />
          <SegmentedControl
            label={t('views.reader.style.typeface')}
            options={TYPEFACE_OPTIONS}
            value={readerStyle.typeface}
            onChange={(typeface) => updateSettings({ readerStyle: { ...readerStyle, typeface } })}
          />
          <SegmentedControl
            label={t('views.reader.style.width')}
            options={WIDTH_OPTIONS}
            value={readerStyle.width}
            onChange={(width) => updateSettings({ readerStyle: { ...readerStyle, width } })}
          />
        </div>
      )}
      {reading.state === 'loading' && (
        <div className="mx-auto w-full max-w-[68ch] px-6 py-10" aria-label={t('views.reader.loading')}>
          <SkeletonRows count={6} />
        </div>
      )}
      {reading.state === 'none' && (
        <EmptyState title={t('views.reader.none.title')} hint={t('views.reader.none.hint')} />
      )}
      {reading.state === 'ready' && (
        <ArticleView
          article={reading.article}
          body={translated && !isShowingOriginal ? translated : reading.article.body}
          images={images}
          style={readerStyle}
          // Said only when it is true: an article whose pictures all arrived has nothing to explain.
          isMissingImages={!isFetchingImages && imagesIn(reading.article.body).some((src) => !images[src])}
        />
      )}
    </SurfaceShell>
  );
}

function ArticleView({
  article,
  body,
  images,
  style,
  isMissingImages,
}: {
  article: Article;
  body: ReaderNode[];
  images: ImageData;
  style: ReaderStyle;
  isMissingImages: boolean;
}) {
  const details = [article.siteName, article.byline, t('views.reader.minutes', { count: article.minutes })].filter(
    Boolean,
  );
  return (
    <article
      className={cn(
        'mx-auto w-full px-6 pb-16 pt-10 leading-relaxed text-ink',
        SIZE_CLASSES[style.size],
        WIDTH_CLASSES[style.width],
        style.typeface === 'serif' && 'font-serif',
      )}
    >
      <h1 className="text-display font-semibold leading-tight">{article.title}</h1>
      <p className="mt-3 text-body-sm text-ink-dim">{details.join(' · ')}</p>
      <div className="mt-8 flex flex-col gap-4">{body.map((node, index) => renderNode(node, index, images))}</div>
      {isMissingImages && (
        <p className="mt-12 border-t border-line pt-4 text-body-sm text-ink-faint">
          {t('views.reader.imagesFetched')}
        </p>
      )}
    </article>
  );
}

function renderNode(node: ReaderNode, key: number, images: ImageData): ReactNode {
  if (node.kind === 'text') {
    return <Fragment key={key}>{node.text}</Fragment>;
  }
  if (node.kind === 'image') {
    const dataUrl = images[node.src];
    // Only ever a data URL from the main process: the chrome makes no request of its own.
    // eslint-disable-next-line @next/next/no-img-element -- next/image optimises fetched images, and this one is already data.
    return dataUrl ? <img key={key} src={dataUrl} alt={node.alt} className="h-auto max-w-full rounded-sm" /> : null;
  }
  const children = node.children.map((child, index) => renderNode(child, index, images));
  switch (node.tag) {
    case 'p':
      return <p key={key}>{children}</p>;
    case 'h2':
      return (
        <h2 key={key} className="mt-4 text-heading font-semibold leading-snug">
          {children}
        </h2>
      );
    case 'h3':
    case 'h4':
      return (
        <h3 key={key} className="mt-2 text-title font-semibold">
          {children}
        </h3>
      );
    case 'ul':
      return (
        <ul key={key} className="list-disc pl-6">
          {children}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="list-decimal pl-6">
          {children}
        </ol>
      );
    case 'li':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-2 border-line-strong pl-4 text-ink-dim">
          {children}
        </blockquote>
      );
    case 'pre':
      return (
        <pre key={key} className="overflow-x-auto rounded-sm bg-inset p-3 font-mono text-body-sm">
          {children}
        </pre>
      );
    case 'code':
      return (
        <code key={key} className="font-mono text-[0.9em]">
          {children}
        </code>
      );
    case 'em':
      return <em key={key}>{children}</em>;
    case 'strong':
      return <strong key={key}>{children}</strong>;
    case 'br':
      return <br key={key} />;
    case 'figcaption':
      return (
        <p key={key} className="text-body-sm text-ink-dim">
          {children}
        </p>
      );
    case 'a': {
      const { href } = node;
      if (!href) {
        return <Fragment key={key}>{children}</Fragment>;
      }
      return (
        <a
          key={key}
          href={href}
          className="text-active underline underline-offset-2"
          onClick={(event) => {
            // Opened as a page in a tab of its own; the chrome never navigates.
            event.preventDefault();
            send((api) => api.tabs.create(href));
          }}
        >
          {children}
        </a>
      );
    }
  }
}
