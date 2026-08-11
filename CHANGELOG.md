# Changelog

Notable changes to Copacetic. Dates are the release date, newest first.

## 1.2.4 — unreleased

### Added

- Tracker blocking can be switched off for one site, from the connection panel
  where the blocked count already is. Blocking occasionally breaks something
  real — a login routed through an analytics domain, an embed that will not
  load — and without a per-site answer the only fix was turning blocking off
  everywhere, which is a far worse trade than the one anyone wanted to make.
  Allowed sites are listed in Settings with a way back.
- What was allowed through is still recorded, so the connection log stays
  honest about a site you chose not to block on.

## 1.2.3 — 2026-08-11

Customisation, keyboard access, and two places the interface was quietly
saying less than it knew.

### Added

- Zoom is remembered per site. A page you need larger arrives larger every
  visit rather than needing setting again, and Settings lists everywhere you
  changed it with a reset each. A level put back to the default is forgotten
  rather than stored, so the list stays the sites you actually changed.
- An interface density, comfortable or compact, in Settings. It changes sizing
  only — the tab strip, the address bar and the header — because colour in this
  interface means state, so a display option must never touch it.

- A keyboard reference in Settings, listing every shortcut. It reads from the
  same list a test checks against the menu, so a binding that changes without
  the reference being updated fails the build rather than quietly leaving the
  reference wrong.

### Fixed

- History no longer stops at 300 entries without saying so. It shows how many
  it is displaying out of how many match, with a button for the rest. A search
  could previously never reach a match past the cap, and nothing indicated
  anything had been left out.
- Tabs can be reached with a keyboard. The strip is now a proper tablist with
  a roving tabindex: one tab stop for the whole strip, arrows to move within
  it, Home and End for the ends, Enter or Space to select and Delete to close.
  Previously every tab was hard-coded unreachable, so there was no way to
  focus, activate or close one without a mouse.
- Focus follows the selection when arrowing through tabs, and does not move
  when a tab is selected by click or by `Cmd/Ctrl+1`–`9` — those should leave
  focus in the page or the address bar where it was.

## 1.2.1 — 2026-08-11

Two things that were missing rather than broken: sites that ask you to sign in
could not be used at all, and your own data could not be taken back out.

### Added

- HTTP authentication. Basic, Digest and the rest were never answered, so
  intranets, routers, NAS boxes and many dev servers simply failed to load —
  the most concrete "this browser cannot do that" left in the product. The
  prompt appears in the chrome, and credentials go to the request that asked
  for them and are kept nowhere.
- Copacetic only asks when the challenge comes from the same origin as the
  page the address bar is showing, or from a proxy. A subresource on another
  origin asking for a password would mean the window says one site while the
  credentials go to another, which is a phishing route rather than a login.
- The realm is server-chosen text displayed inside Copacetic's own window, so
  it is stripped of control characters and bidirectional overrides, collapsed
  to one line, capped, and shown quoted and attributed to the site.
- Settings can export bookmarks and history. Bookmarks are written in the
  Netscape format every browser imports; history is plain JSON, readable in a
  text editor. "Everything lives on this machine" is honest but on its own it
  is also lock-in, and this makes the claim checkable.

## 1.2.0 — 2026-08-11

Four features that all do the same thing: say something true about the page
that no mainstream browser will tell you without developer tools.

Released as `1.2.0-beta.1` first, which exercised the pipeline on all three
platforms before anything reached the stable channel.

### Added

- The connection badge shows who issued the certificate and when it expires,
  on any encrypted page. An expiry within a fortnight is shown in amber, which
  is the only new colour: it is state a user has no other way to see.
- Only a certificate Chromium accepted is ever described. Reporting the issuer
  of one it rejected would make a failed connection look informative.
- The panel says when a certificate chains to a root installed on this machine
  rather than one the system shipped with. That is what TLS interception looks
  like — a company proxy, antivirus, or a debugging tool reading the
  connection — and every mainstream browser shows the same padlock for it as
  for an ordinary connection.
- The connection panel lists every host the page contacted, how many requests
  each received, and how many were blocked — including hosts that were allowed
  through, and including trackers when blocking is switched off. The blocked
  count says what was stopped; this says what was not.
- The connection panel lists what the current site has already been allowed or
  refused to do, with a reset for each. Those decisions were always stored and
  always honoured — they were just listed in Settings, away from the site they
  apply to, which is not where anyone looks.
- The address bar uses the full IANA Public Suffix List instead of a
  hand-written list of about forty suffixes. `user.github.io`,
  `thing.s3.amazonaws.com` and `example.pvt.k12.ma.us` are now read correctly,
  and two projects sharing a host no longer look like the same site. Verified
  against the conformance suite published with the list — all 78 cases.

### Fixed

- The connection detail is visible again on any page that actually loads. It
  was an absolutely positioned popover hanging over the content area, and a
  native view always paints above the renderer's HTML, so it was hidden behind
  the page on every real site. It only ever looked right on the start page,
  which has no view to hide it. It is now part of the chrome column, like the
  address-bar suggestions and the find bar, and the page is pushed down.

Certificate reporting closes a gap the README named itself. Its scope is
unchanged and still honest: Copacetic reports Chromium's judgement rather than
doing any chain analysis of its own.

## 1.1.1 — 2026-08-10

### Fixed

- The `.deb` no longer registers an apt source that does not exist. The
  repository could not be published: GitHub rejects any file over 100 MB and
  the package is around 150 MB, so the `gh-pages` push failed after the
  installers had already gone out. A source pointing at a 404 makes
  `apt update` fail on every run, so the package now installs without touching
  apt, and Settings says plainly that Linux `.deb` updates are manual.
- The 1.1.0 and 1.1.0-beta.1 `.deb` assets were withdrawn for the same reason.
  Every other installer from those releases is unaffected.

The apt work itself is finished and correct — signing, indexes, the install
script — and is gated behind an `APT_REPO_URL` variable until the packages have
somewhere to live.

## 1.1.0 — 2026-08-10

Released as `1.1.0-beta.1` first, which exercised the release pipeline on all
three platforms before anything reached the stable channel.

Adds update checking, and carries the hardening and performance work that was
staged as 1.0.1 but never released on its own — everything below reaches a user
in the same build.

### Added

- **Update checking**, split by what each platform actually allows.
  - Windows (NSIS) and the Linux AppImage download an update in the background
    and apply it on quit.
  - The `.deb` registers Copacetic's own signed apt repository when it
    installs, so upgrades arrive with a normal `apt upgrade` rather than the
    app writing over a file `dpkg` owns. The repository is published to GitHub
    Pages by the release workflow and signed with a key bound to that source
    alone.
  - macOS cannot install updates itself, because doing so in place requires a
    code-signed app. That build says so plainly in Settings and offers the
    download rather than a button that would fail.
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
