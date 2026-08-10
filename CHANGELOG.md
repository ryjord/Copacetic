# Changelog

Notable changes to Copacetic. Dates are the release date, newest first.

## 1.0.1 — unreleased

A correctness and hardening release. No new features, and no change to how
anything looks. Several of these close gaps between what the README's security
table claimed and what the code actually did.

### Security

- Page code can no longer send a tab to a `file:` URL. Typing a local path in
  the address bar still works — that is a thing a user can mean — but
  `window.open('file:///…')`, a `file:` redirect and a `file:` link in the page
  context menu are all refused now.
- Schemes the security model refuses for navigation are no longer handed to
  `shell.openExternal` instead. Previously `javascript:`, `data:`, `blob:`,
  `vbscript:` and `filesystem:` fell through to a confirmation dialog and, if
  accepted, went to whichever application the OS associated with them.
- Favicons are only fetched when the page could have reached them itself. A
  page naming `169.254.169.254`, an RFC1918 address or a `.local` name had that
  request made for it by the main process, in the web session, with whatever
  cookies the user already held for that host.
- A favicon response is size-checked before its body is buffered rather than
  after, so an oversized response cannot exhaust main-process memory.
- The page context menu no longer offers to open a `data:` image in a new tab.
- `TabManager.create` refuses any scheme outside the navigable set, so a future
  caller cannot open a `data:` or `javascript:` tab by forgetting a check.
- The tracker blocker matches fully-qualified hostnames. `doubleclick.net.`
  resolves identically to `doubleclick.net` but skipped the entire list.
- Download filenames are checked against Windows device names (`CON`, `PRN`,
  `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), and trailing dots and spaces are
  stripped — Windows drops them silently, so `invoice.pdf.` was written as
  something other than what the download list showed.

### Fixed

- Session restore activated the wrong tab whenever a start-page tab sat to the
  left of the active one. The active index was counted against the unfiltered
  tab order but used to index the filtered list of restored URLs.
- A permission prompt whose tab was closed before it was answered never
  settled. The page's promise hung forever, the resolver was retained for the
  life of the session, and the chrome kept rendering a banner for a tab that no
  longer existed. Closing the tab now counts as a denial.
- Numeric settings were bounded when read from disk but not when updated over
  IPC, so an out-of-range sidebar width or zoom factor persisted until the next
  launch.
- Switching tabs with `Cmd/Ctrl+1`–`9` while the address bar was mid-edit left
  the draft on screen pointed at the new tab, so pressing Enter navigated the
  wrong one. Tab switches by shortcut happen entirely in the main process and
  never blurred the input the way clicking a tab does.
- One `Escape` press closed two layers when the connection popover was open
  over a surface. Overlays now share a dismissal stack, and only the topmost
  one answers.

### Internal

- CI runs on `development` as well as `main`, and cancels superseded runs on
  the same ref instead of queuing a full three-OS matrix behind each push.
- Test coverage added for every behaviour above that can be tested without
  booting Electron: 120 tests, up from 66.

## 1.0.0 — 2026-08-01

First release. Installers for macOS, Windows and Linux.
