import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Template = Record<string, unknown>[];

let captured: Template = [];

vi.mock('electron', () => ({
  app: { name: 'Copacetic' },
  shell: { openExternal: () => {} },
  Menu: {
    buildFromTemplate: (template: Template) => {
      captured = template;
      return { template };
    },
  },
}));

const { buildApplicationMenu } = await import('../../electron/main/menus/menu');

const browserSource = readFileSync('electron/main/app/browser.ts', 'utf8');
const tabsSource = readFileSync('electron/main/tabs/tabs.ts', 'utf8');

/**
 * Every click reaches into Browser by name. A renamed or removed method leaves
 * a menu item that looks fine and throws when someone picks it, which nothing
 * else in the suite would notice.
 */
const reached: string[] = [];

function recorder(path: string): unknown {
  return new Proxy(() => {}, {
    get: (_target, property) => {
      if (typeof property !== 'string') {
        return undefined;
      }
      return recorder(path ? `${path}.${property}` : property);
    },
    apply: () => {
      reached.push(path);
      return undefined;
    },
  });
}

function everyItem(template: Template): Record<string, unknown>[] {
  return template.flatMap((item) => {
    const submenu = item.submenu as Template | undefined;
    return [item, ...(Array.isArray(submenu) ? everyItem(submenu) : [])];
  });
}

buildApplicationMenu(recorder('') as Parameters<typeof buildApplicationMenu>[0]);
const items = everyItem(captured);
for (const item of items) {
  if (typeof item.click === 'function') {
    (item.click as () => void)();
  }
}

describe('the application menu', () => {
  it('builds something', () => {
    expect(items.length).toBeGreaterThan(20);
  });

  it('reaches for methods that exist', () => {
    expect(reached.length).toBeGreaterThan(0);
    const missing = [...new Set(reached)].filter((path) => {
      const method = path.split('.').pop() ?? '';
      const source = path.startsWith('tabs.') ? tabsSource : browserSource;
      return !new RegExp(`\\b(async )?${method}\\s*[(<]`).test(source);
    });
    expect(missing).toEqual([]);
  });

  // Two items on one accelerator means one of them can never be reached by the
  // shortcut it advertises.
  it('binds no accelerator twice', () => {
    const accelerators = items
      .map((item) => item.accelerator)
      .filter((accelerator): accelerator is string => typeof accelerator === 'string');
    const duplicates = accelerators.filter((value, index) => accelerators.indexOf(value) !== index);
    expect(duplicates).toEqual([]);
  });

  it('gives every item something to show or a role to play', () => {
    for (const item of items) {
      const isPresentable =
        typeof item.label === 'string' || typeof item.role === 'string' || item.type === 'separator';
      expect(isPresentable).toBe(true);
    }
  });

  it('offers a Hush tab, which is the whole point of having one', () => {
    const labels = items.map((item) => item.label);
    expect(labels).toContain('New Hush tab');
  });
});
