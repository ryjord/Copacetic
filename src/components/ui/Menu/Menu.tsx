'use client';

import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  isDestructive?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  /** The control that opens it. Must accept a ref, like a Button. */
  trigger: ReactNode;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
}

/**
 * A menu inside a surface. Arrow keys, typeahead and Escape behave as in a
 * native menu, and Escape closes only the menu.
 *
 * Only for surfaces, which hide the page while they are open: anything the
 * chrome draws over a page sits underneath it, so the toolbar uses native menus.
 */
export function Menu({ trigger, items, align = 'end' }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="animate-pop min-w-44 rounded-md bg-raised p-1 shadow-popover"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex h-7 items-center rounded-xs px-2 text-body outline-none data-[highlighted]:bg-hover data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-accent data-[disabled]:opacity-40',
                item.isDestructive ? 'text-alert' : 'text-ink',
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
