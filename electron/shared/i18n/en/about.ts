/** Settings, About: versions, where to read more, and the licences. Product names are names, not words, and stay in the code. */
export const about = {
  platform: 'Platform',
  copyDetails: {
    label: 'Details for a bug report',
    help: 'The versions above and this platform, ready to paste. Nothing else is included.',
    action: 'Copy',
    copied: 'Copied.',
  },
  transparency: {
    label: 'What Copacetic sends and keeps',
    help: 'Every request it makes, everything it stores, and what it does not do.',
    action: 'Read',
  },
  diagnostics: {
    label: 'Diagnostics log',
    help: 'A record of what Copacetic did, never of the pages you visited. It stays on this machine.',
    action: 'Show',
  },
  licences: {
    label: 'Licences',
    help: 'Copacetic is MIT licensed. The packages it is built on, and the filter lists, keep their own terms.',
    show: 'Show',
    hide: 'Hide',
    missing: 'The list is written when Copacetic is built, and this copy does not have it.',
    heading: 'Open-source packages ({count})',
    ownSubtitle: 'MIT',
    filterLists: 'EasyList and EasyPrivacy',
    filterListsSubtitle: 'GPLv3 or CC BY-SA 3.0',
    noFile: 'This package ships no licence file; it declares itself {licence}.',
  },
  chromiumLicences: {
    label: "Chromium's licences",
    help: 'The engine underneath, and everything it includes, as one long page.',
    action: 'Open',
  },
} as const;
