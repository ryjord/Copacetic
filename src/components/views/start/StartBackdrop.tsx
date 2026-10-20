'use client';

// Utils
import { cn } from '@/lib/utils';

interface StartBackdropProps {
  photo: string;
  /** Percent darkened, so the clock and search stay legible over a photograph nobody vetted. */
  dim: number;
  isBlurred: boolean;
}

/** A start page photo with its dim and blur, shared by the start page and its preview in Settings. */
export function StartBackdrop({ photo, dim, isBlurred }: StartBackdropProps) {
  return (
    <>
      {/* A data URL already in memory, in a static export with no image loader: next/image has nothing to offer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt=""
        aria-hidden
        className={cn('absolute inset-0 size-full object-cover', isBlurred && 'scale-110 blur-xl')}
      />
      <div className="absolute inset-0 bg-base" style={{ opacity: dim / 100 }} aria-hidden />
    </>
  );
}
