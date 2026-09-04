/**
 * What a new tab inherits from the tab that opened it.
 *
 * A Hush tab's promise is that nothing it does is written down, and that
 * promise was being kept only for the tab itself. Every way of opening a second
 * tab from the first produced an ordinary, recorded one: `target="_blank"`,
 * `window.open`, middle-click, "Open link in new tab", "Open image in new tab",
 * and "Search for …" on a selection. The address landed in history, the icon in
 * the favicon cache, the certificate in certificates.json — the exact record
 * the tab exists not to leave, reached by following a link.
 *
 * It was three separate findings and one cause: the flag was passed at tab
 * creation and never inherited, so every new caller had to remember, and none
 * of them did. The rule lives here instead, and tab creation applies it, so a
 * caller has to say who opened the tab rather than remember what that implies.
 */

/** What is known about the tab a new one is being opened from. */
export interface OpenerTab {
  isHush: boolean;
  groupId: string | null;
}

/** What the caller asked for, where anything unset is a question for the opener. */
export interface RequestedTab {
  hush?: boolean;
  groupId?: string | null;
}

export interface InheritedTab {
  hush: boolean;
  groupId: string | null;
}

/**
 * An explicit request always wins: "New Hush tab" means Hush whatever it was
 * opened from, and a tab dropped into a group names that group. Everything left
 * unsaid comes from the opener, and a tab with no opener is an ordinary tab in
 * no group — which is what someone typing an address into a new window gets.
 */
export function inheritFromOpener(opener: OpenerTab | null, requested: RequestedTab = {}): InheritedTab {
  return {
    hush: requested.hush ?? opener?.isHush ?? false,
    groupId: requested.groupId !== undefined ? requested.groupId : (opener?.groupId ?? null),
  };
}
