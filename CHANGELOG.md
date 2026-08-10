# Changelog

Notable changes to Copacetic. Dates are the release date, newest first.

## 1.1.0 — unreleased

Adds update checking, and carries the hardening and performance work that was
staged as 1.0.1 but never released on its own — everything below reaches a user
in the same build.

### Added

- **Update checking**, split by what each platform actually allows.
  - Windows (NSIS) and the Linux AppImage download an update in the background
    and apply it on quit.
  - macOS and the Linux `.deb` cannot install updates themselves — macOS
    because the build is not code-signed, `.deb` because the system package
    manager owns it. Those builds say so plainly in Settings and offer the
    release page rather than a button that would fail.
  - Settings gains an Updates section showing the current state, a "Check now"
    button, and a toggle for the periodic check.
- The update check is the only network request Copacetic makes on its own
  behalf. It reads a version number from the GitHub releases API and sends
  nothing about the user. It can be turned off, and the Settings copy says
  exactly what it does.

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

### Performance

- The address bar no longer re-parses the whole history on every keystroke.
  Scoring derived each entry's host with `new URL()` on every query, which
  measured 152ms per keystroke against a ten-thousand-entry profile — running
  synchronously in the process that also drives the page. Parsed forms are
  cached per entry and re-derived only when a URL or title actually changes.
  The same profile now measures 1.3ms per keystroke.
- Typing no longer relayouts every open page. `applyBounds` resized every tab,
  and resizing a view forces a relayout of the page inside it. The chrome
  reports new insets whenever its own height changes, which the suggestion list
  does as the number of results changes, so one character typed resized every
  tab at once. Only the visible tab is resized now; background views are sized
  when they are created and again when they are activated.

### Internal

- CI runs on `development` as well as `main`, and cancels superseded runs on
  the same ref instead of queuing a full three-OS matrix behind each push.
- Test coverage added for every behaviour above that can be tested without
  booting Electron: 120 tests, up from 66.

## 1.0.0 — 2026-08-01

First release. Installers for macOS, Windows and Linux.
