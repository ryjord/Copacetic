import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * The type scale's names would otherwise read as text colours, and merging
 * `text-body-sm` with `text-ink-dim` would silently drop the size.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'body-sm', 'body', 'title', 'heading', 'display'] }],
      shadow: [{ shadow: ['popover', 'dialog'] }],
      rounded: [{ rounded: ['xs', 'sm', 'md', 'lg', 'tab', 'field', 'panel'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
