/** What a launch does with the tabs from last time: reopen them, offer to, or start fresh. */
export type LaunchRestore = 'reopen' | 'offer' | 'fresh';

/** Someone who turned reopening off still gets their tabs offered back after a crash, which they did not choose. */
export function launchRestore(options: {
  isReopenOn: boolean;
  hasSavedWindows: boolean;
  didLastRunEndBadly: boolean;
}): LaunchRestore {
  if (!options.hasSavedWindows) {
    return 'fresh';
  }
  if (options.isReopenOn) {
    return 'reopen';
  }
  return options.didLastRunEndBadly ? 'offer' : 'fresh';
}
