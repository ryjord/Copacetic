'use client';

// Libs
import { Fragment, useEffect, useState, type ReactNode } from 'react';

// Components
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton/Skeleton';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { articleFrom, imagesIn, type Article, type ReaderNode } from '@/lib/reader/article';
import { t } from '@shared/i18n/translate';

type Reading = { state: 'loading' } | { state: 'none' } | { state: 'ready'; article: Article };

/** Data URLs fetched by the main process, keyed by the address the article named. */
type ImageData = Record<string, string>;

/** The page in front, without the page around its text. */
export function ReaderSurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const [reading, setReading] = useState<Reading>({ state: 'loading' });
  const [images, setImages] = useState<ImageData>({});

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      const document = activeTabId ? await ask((api) => api.tabs.readerDocument(activeTabId), null) : null;
      const article = document ? articleFrom(document.html, document.url) : null;
      if (!isCurrent) {
        return;
      }
      setReading(article ? { state: 'ready', article } : { state: 'none' });
      // The text first, so reading can start while the pictures arrive.
      const wanted = article ? imagesIn(article.body) : [];
      if (activeTabId && wanted.length > 0) {
        const fetched = await ask((api) => api.tabs.readerImages(activeTabId, wanted), {});
        if (isCurrent) {
          setImages(fetched);
        }
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [activeTabId]);

  const title = reading.state === 'ready' ? reading.article.title : t('views.reader.title');

  return (
    <SurfaceShell title={title}>
      {reading.state === 'loading' && (
        <div className="mx-auto w-full max-w-[68ch] px-6 py-10" aria-label={t('views.reader.loading')}>
          <SkeletonRows count={6} />
        </div>
      )}
      {reading.state === 'none' && (
        <EmptyState title={t('views.reader.none.title')} hint={t('views.reader.none.hint')} />
      )}
      {reading.state === 'ready' && <ArticleView article={reading.article} images={images} />}
    </SurfaceShell>
  );
}

function ArticleView({ article, images }: { article: Article; images: ImageData }) {
  const details = [article.siteName, article.byline, t('views.reader.minutes', { count: article.minutes })].filter(
    Boolean,
  );
  return (
    <article className="mx-auto w-full max-w-[68ch] px-6 pb-16 pt-10 text-title leading-relaxed text-ink">
      <h1 className="text-display font-semibold leading-tight">{article.title}</h1>
      <p className="mt-3 text-body-sm text-ink-dim">{details.join(' · ')}</p>
      <div className="mt-8 flex flex-col gap-4">
        {article.body.map((node, index) => renderNode(node, index, images))}
      </div>
      <p className="mt-12 border-t border-line pt-4 text-body-sm text-ink-faint">{t('views.reader.imagesFetched')}</p>
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
