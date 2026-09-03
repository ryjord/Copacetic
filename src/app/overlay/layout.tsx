import type { ReactNode } from 'react';

/**
 * The overlay's own document, with no background of its own.
 *
 * Anything opaque here would be a sheet over the whole page: this view covers
 * the top of the content area whether or not it is drawing anything.
 */
export default function OverlayLayout({ children }: { children: ReactNode }) {
  return <div className="bg-transparent">{children}</div>;
}
