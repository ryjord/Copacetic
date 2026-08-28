import { GROUP_COLOURS, type GroupColourId, type TabGroup } from '../../shared/tab-groups';
import { PersistedFile, asString, isRecord, newId } from './persistence';

/**
 * The groups themselves, which persist. Which tabs are in them does not live
 * here: a Hush tab's membership must never reach the disk, and keeping
 * membership with the tab rather than the group means there is nowhere for it
 * to be written down by accident.
 */
export class GroupsStore {
  private readonly file = new PersistedFile<TabGroup[]>('groups.json', () => [], reviveGroups);

  list(): TabGroup[] {
    return this.file.get();
  }

  find(id: string): TabGroup | null {
    return this.file.get().find((group) => group.id === id) ?? null;
  }

  create(name: string, colour: GroupColourId, ownSession: boolean): TabGroup {
    const group: TabGroup = { id: newId(), name: name.trim() || 'Group', colour, ownSession, collapsed: false };
    this.file.update((groups) => [...groups, group]);
    return group;
  }

  /**
   * Everything about a group can be changed except whether it keeps its own
   * browsing. That decides which session its tabs already loaded in, and
   * changing it would silently sign someone out of pages that are open.
   */
  update(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    this.file.update((groups) =>
      groups.map((group) =>
        group.id === id
          ? {
              ...group,
              name: changes.name === undefined ? group.name : changes.name.trim() || group.name,
              colour: changes.colour ?? group.colour,
              collapsed: changes.collapsed ?? group.collapsed,
            }
          : group,
      ),
    );
  }

  remove(id: string): void {
    this.file.update((groups) => groups.filter((group) => group.id !== id));
  }

  flush(): void {
    this.file.flush();
  }
}

const COLOUR_IDS = new Set<string>(GROUP_COLOURS.map((colour) => colour.id));

/**
 * Read back off disk, where the file can be edited or written by something
 * else. A colour that is not one of ours would put a group outside the palette
 * the whole rule rests on, so an unknown one becomes the first rather than
 * being trusted.
 */
export function reviveGroups(raw: unknown): TabGroup[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = asString(item.id);
    const name = asString(item.name).slice(0, 60);
    if (!id || !name) {
      return [];
    }
    const colour = asString(item.colour);
    return [
      {
        id,
        name,
        colour: (COLOUR_IDS.has(colour) ? colour : GROUP_COLOURS[0].id) as GroupColourId,
        ownSession: item.ownSession === true,
        collapsed: item.collapsed === true,
      },
    ];
  });
}
