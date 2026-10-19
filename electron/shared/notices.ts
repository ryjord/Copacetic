import { t } from './i18n/translate';

/**
 * The rules for what the app is allowed to tell you, before any of it is drawn.
 *
 * Three features have now finished something and had no way to say so: saving a
 * group as a folder skips Hush tabs and could not mention it, an import adds
 * bookmarks in silence, and a filter list would update invisibly. Each of them
 * ends at a count nobody reads.
 *
 * The danger in fixing that is the opposite one. A notice for every action is a
 * notice for none: they stop being read, and then the one that mattered is not
 * read either. So the rules here are mostly about what does not get said.
 */
export type NoticeTone =
  /** Something happened that you could not otherwise have known. */
  | 'info'
  /** Something you asked for is finished, and the result is worth a number. */
  | 'done'
  /** Something needs a decision before it happens. */
  | 'ask';

export interface Notice {
  id: string;
  tone: NoticeTone;
  message: string;
  /**
   * What two notices about the same thing share. A second one replaces the
   * first rather than stacking beneath it: three copies of "12 bookmarks added"
   * is not three times the information.
   */
  key: string;
  /** The label of the thing that acts, for an `ask`. Nothing else may carry one. */
  confirm?: string;
}

/**
 * How long a notice stays before it goes on its own.
 *
 * An `ask` never does. A question that withdraws itself is a decision made by
 * timing out, which is not a decision anyone made.
 */
export function dismissAfterMs(tone: NoticeTone): number | null {
  if (tone === 'ask') {
    return null;
  }
  return tone === 'done' ? 4_000 : 6_000;
}

/**
 * At most this many at once. Beyond it the oldest goes, because a stack tall
 * enough to need scrolling has stopped being a notice and become a log.
 */
export const MOST_AT_ONCE = 3;

/**
 * Adds a notice to what is already showing.
 *
 * A question is never pushed out by something that is merely informative: it is
 * waiting on a person, and dropping it would answer it by discarding it.
 */
export function admit(current: readonly Notice[], incoming: Notice): Notice[] {
  const withoutSameThing = current.filter((notice) => notice.key !== incoming.key);
  const next = [...withoutSameThing, incoming];

  if (next.length <= MOST_AT_ONCE) {
    return next;
  }

  const droppable = next.findIndex((notice) => notice.tone !== 'ask');
  // Every one of them is a question. None can be dropped, so the cap gives way:
  // a question that vanished unanswered is worse than a fourth row.
  if (droppable === -1) {
    return next;
  }
  return next.filter((_, index) => index !== droppable);
}

/** Removes one, which is what dismissing and answering both do. */
export function dismiss(current: readonly Notice[], id: string): Notice[] {
  return current.filter((notice) => notice.id !== id);
}

/**
 * What to say about a group saved as a folder.
 *
 * The Hush count is the reason this exists. A Hush tab is not saved, and
 * finding that out by counting the folder afterwards is finding it out too
 * late - the promise Hush makes is only kept if it is also stated.
 */
export function savedGroupMessage(saved: number, skippedHush: number, folderName: string): string {
  const pages = t('main.notices.pages', { count: saved });
  if (skippedHush === 0) {
    return t('main.notices.savedGroup', { pages, folderName });
  }
  const hush = t('main.notices.hushTabsWere', { count: skippedHush });
  return t('main.notices.savedGroupWithHush', { pages, folderName, hush });
}

/**
 * What to say about an import.
 *
 * The number already saved is said out loud rather than folded into the total,
 * so a short number after importing a big file reads as arithmetic instead of
 * as a failure.
 */
export function importedMessage(added: number, alreadyHad: number): string {
  const bookmarks = t('main.notices.bookmarks', { count: added });
  if (alreadyHad === 0) {
    return t('main.notices.added', { bookmarks });
  }
  const alreadySaved = t('main.notices.wereAlreadySaved', { count: alreadyHad });
  return t('main.notices.addedWithExisting', { bookmarks, alreadySaved });
}

/**
 * How many tabs may be opened without asking first.
 *
 * Naming the number on a button is not the same as consenting to it: a folder
 * of two hundred pages opens two hundred tabs from one click, and no window
 * survives that in a state anyone can use.
 */
export const OPEN_WITHOUT_ASKING = 10;

export function openFolderMessage(count: number, folderName: string): string {
  return t('main.notices.openFolder', { folderName, count });
}
