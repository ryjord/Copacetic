# Changelog

Notable changes to Copacetic. Dates are the release date, newest first.

## 1.4.1 — unreleased

Batch 1 of the September audit.

### Changed

- **The apt pool keeps one package per version line.** It kept the newest three,
  which was about to be wrong: a run of patch releases inside one line would
  have evicted every older line, and someone still on 1.3 would have found 1.3
  gone from apt while three 1.4 patches sat in its place. It now keeps the
  newest 1.2, 1.3, 1.4 and 1.5 — the versions someone might reasonably still be
  on — and stays at four however many patches each line collects. The bucket it
  publishes to has limited room and each package is about 150MB, so the pool
  cannot simply grow.

### Fixed

- **The filter lists are credited to the people who make them.** EasyList and
  EasyPrivacy ship inside Copacetic in full, and they are not Copacetic's to
  license: they are offered under the GPLv3 or CC BY-SA 3.0, in an MIT repository
  that had no notice of either. A NOTICE file now names each list, where it came from and
  under what terms, the README points at it, and Privacy says it on the screen
  where the lists are already named.

- **The download is a third of the size.** The application was shipping every
  package the interface is built with — React, Next, the whole component
  library, an icon set, and a native Rust compiler — inside itself, where the
  main process never loaded any of them. They are needed to _build_ the
  interface; what the application actually runs is the 1.3MB of HTML and
  JavaScript that build produces. Moving them where they belong takes the
  archive inside the app from 246MB to 15MB and the whole thing from 625MB to
  291MB, with nothing removed that anything used.

- **Downloads are listed among the things a clear does not touch, and can be
  cleared.** Clearing history took the history and the cached icons and left
  `downloads.json` holding every address and redirect chain, while the pane that
  exists to say what survives a clear did not mention it. The files you saved
  stay where they are; what goes is the record of where they came from.
- **A zoom that is not a number cannot be stored.** The default zoom was checked
  for being a number and then kept as given, unlike the per-site levels sitting
  beside it — and clamping carried it through, because the arithmetic that
  clamps propagates a non-number whichever way round it is written. It reached a
  tab, and the interface had a zoom of NaN per cent to display.

- **A damaged line in the certificate file no longer costs you the rest of it.**
  What each site presented last time was asserted to have the right shape rather
  than read, so one malformed entry reached the comparison as a string or a
  number — and that comparison is the thing that notices a connection which has
  started being intercepted. Each entry is now read on its own: a bad one loses
  only its own site, which means that site is treated as newly seen, rather than
  taking every remembered certificate with it.

- **The blocked-request total stops resetting every time you start.** The count
  was recorded against each page correctly and then dropped when the file was
  read back, so the running total returned to nothing on every launch while the
  real numbers sat on disk untouched. The store that holds it had no tests at
  all; it does now.
- **A setting the interface sends is checked before it is kept.** An unknown
  theme or search engine was stored as given and used until the next start,
  when the file's own reader quietly corrected it — a setting that fixed itself
  overnight with no explanation. A zoom level was stored exactly as sent, so a
  value far outside anything the controls offer could be written down and read
  back later as that site's zoom.

- **What you had open survives losing power.** Stored files were written and
  renamed into place without waiting for the disk to confirm the write, so a
  machine that lost power in between could make the rename stick and the
  contents not — publishing an empty file where your bookmarks had been. They
  are now flushed to the disk before the rename, written readable only by you
  rather than by every account on the machine, and a rename blocked by an
  antivirus scanner or a search indexer is retried instead of dropped.
- **The tabs you have open are written down as they change.** They were saved
  once, on the way out, so anything that was not a polite quit — a crash, a
  power cut, a forced shutdown — lost every one of them.

- **Notices can be answered with the keyboard again, reliably.** The smoke
  harness fell back to the chrome window whenever the overlay had not appeared
  yet, so keystrokes meant for a question went to the wrong page, found a button
  that happened to match, and failed somewhere else entirely. It waits for the
  overlay properly now and says so plainly if it never arrives.

- **Forgetting a site now signs you out of it.** It cleared the history, the
  cached icon, the remembered certificate, the zoom, the permissions and the
  blocking exception, and never touched the session — so the first thing anyone
  would check afterwards, whether they were still logged in, was the one thing
  that had not changed, while the menu item said "Forget example.com" and the
  code said it removed everything known about the site. Cookies and site storage
  now go too, from ordinary browsing, from Hush, and from every group that keeps
  its own — a group's cookies are still that site's cookies, including the ones
  scoped across every subdomain, which is the shape a sign-in cookie usually has
  and the shape the first version of this fix quietly skipped. The count is named
  before it happens as well as after, because a warning that leaves out the part
  people care about is the same problem one step earlier.

- **Settings and About stop denying a feature that ships.** Filling a password
  from the right-click menu arrived in 1.3.2. For four releases afterwards the
  Passwords pane said "Copacetic does not fill them in yet", and, asked
  directly, "No, and it will not" — on the surface this browser points at to be
  judged. The README still said there was no password manager at all, two
  releases after the vault shipped. All four now describe what happens: one
  short script, run when you ask, gone when it returns. The half that was true
  is kept and said more plainly — nothing ever offers to save what you type,
  because that needs code sitting in every page permanently, and that is the
  guarantee save-on-submit was dropped to keep.

- **Following a link out of a Hush tab no longer leaves a record.** The tab kept
  its promise; nothing opened from it did. `target="_blank"`, `window.open`,
  middle-click, "Open link in new tab", "Open image in new tab" and "Search
  for …" all opened an ordinary, recorded tab — the address went to history, the
  icon to the cache and the certificate to disk, reached by following a link
  from the one place that exists not to do that. A new tab now takes Hush, and
  its group, from the tab that opened it unless it is told otherwise, decided
  where every tab is created rather than remembered separately by each of the
  six ways to open one.

- **A group that keeps its own browsing is now protected like everything else.**
  There are three kinds of session — ordinary, Hush, and a group's own — and
  only two of them were ever set up, because the setup was written out by hand
  twice and nobody wrote it a third time. Tabs in a group with its own session
  therefore ran with no permission handling at all, which means Electron's
  default applied and the default is to approve; with no tracker blocking, while
  the address bar went on showing a blocked count of zero, which reads as a
  clean page rather than an unprotected one; and with no download handling, so
  filenames skipped the right-to-left override and path stripping. Every session
  is now prepared in one place, before the tab that uses it exists, and the
  tests count the call sites so a second copy cannot appear.
- **A lost version record no longer destroys what it was meant to protect.**
  Migration steps ran again whenever `schema.json` went missing — an interrupted
  write, a half-restored backup, a profile copied without it. Running them twice
  was not wasteful but destructive: the session step returned a session with no
  tabs in it, and the bookmarks step un-filed every bookmark from every folder.
  Both now recognise their own output and leave it alone, and every step is
  tested by running it twice.

## 1.4.0 — 2026-09-03

### Added

- **What it costs to run, measured rather than claimed.** The README now
  publishes start-up time, what the blocking engine costs to load, and memory
  with pages open, alongside the machine that produced them and the script that
  produces yours: `npm run measure` launches the built app on a throwaway
  profile five times and reports the median. Nothing here was worth stating
  without a way for someone else to check it.
- **Signing in to Google works.** It refused before, and the reason turned out to
  be that Copacetic said it was Chrome and then did not behave like one:
  Chromium in Electron sends none of the client-hint headers every real Chrome
  sends on every secure request, and a sign-in page reads those before a single
  script runs. Those, the browser's own description of itself, the languages it
  offers and `window.chrome` all now say the same thing. With one difference
  left on purpose: only the three hints Chrome sends unprompted are sent, so a
  site that asks for the high-entropy ones through `Accept-CH` gets no answer.
  That is itself something a determined site can notice, and it is still the
  right trade — those hints are the full version, the architecture, the
  bitness and the device model, and nothing needs them to let you sign in.
  Page content still runs no script of Copacetic's — the fix is entirely in
  the main process.
- **Development servers open.** A certificate signed by nobody is accepted from
  `localhost`, `127.0.0.1`, `::1` and `.localhost`, and nowhere else; reaching
  that traffic already means being on the machine. The badge says the
  certificate was not checked rather than claiming it was.
- **Copacetic can be your default browser.** Settings says what your platform
  will actually do: macOS and Linux can be asked, and Windows 10 and 11 do not
  let an application make itself the default at all, so there it opens the
  screen where you choose.
- **Appearance shows you the change before you keep it.** A working miniature of
  the window sits at the top of the pane and follows every choice — density,
  atmosphere, widgets, wallpaper. Nothing is saved until Keep these, and Discard
  puts it all back. The atmosphere can be turned with a slider or named as a
  colour, and the two are the same value said two ways.
- **A diagnostics log**, kept on this machine and sent nowhere. It records what
  Copacetic did rather than what you did with it: an address is reduced to its
  scheme before anything is written, so it can say a page failed without saying
  which. Settings has a button that opens it, so you can read it before deciding
  whether to share it.
- **Downloads can be checked against where they came from.** Every release is
  attested by GitHub, so `gh attestation verify <file> --repo ryjord/Copacetic`
  proves a download came out of this repository. The builds are still unsigned;
  this is the part of that question that can be answered for nothing.
- **Tab groups.** A run of tabs takes a name, a colour and a place in the strip.
  Click the name to rename it where it sits; right-click for colour, collapse,
  ungroup or close. A group can keep its own cookies and logins, decided when it
  is made and never after — changing it later would sign you out of pages open in
  front of you. A group holding a Hush tab says so rather than claiming to be
  separate, because that would be true of only part of what it names.
- **Bookmark folders, and they nest.** Drag a bookmark onto a folder to file it,
  or use the bookmark's own menu, which lists every folder by its full path so
  filing never needs a mouse. Deleting a folder keeps everything inside it — its
  bookmarks and its child folders move up to where it was. A folder cannot be
  dropped inside itself; that is refused while the cursor is still over it,
  because the subtree would detach with nowhere to drag it back from. Counts are
  given both ways, since a tree makes every number ambiguous.
- **A folder is a tab group at rest.** A folder opens as a tab group carrying its
  name and colour, and a group saves as a folder the same way. The group does not
  inherit its own session — that is decided when a group is made — and a Hush tab
  is never saved, because a bookmark is written to disk.
- **A bookmarks bar**, off until switched on in Settings. It carries the top level
  only: a bar that flattened the tree would put something filed three folders deep
  beside something filed nowhere. A folder on it opens as a menu.
- **Ad and tracker blocking.** EasyList and EasyPrivacy ship inside the app —
  136,716 rules — with the curated 122 domains underneath as a floor, so a list
  that fails to load cannot make Copacetic block less than it did before it had
  one. The lists are in the repository as text and change only with a release or
  when you press "Check for newer lists"; nothing fetches them on a timer,
  because that is a periodic request from your machine to a server. What a
  blocked advert leaves behind is collapsed with a stylesheet, not an injected
  script — page content still runs none of Copacetic's. The connection panel
  says whether a hostname or a rule stopped each request, and Settings says
  plainly what blocking cannot do: same-origin adverts, server-inserted adverts
  and sponsored posts inside a feed are not blocked and are not counted.
- **Notices.** The app can now say what it finished and ask before something
  costly. Saving a group as a folder says how many Hush tabs were left out, which
  is the point: the promise Hush makes is only kept if it is also stated. Opening
  a folder of more than ten pages asks first — naming the number on a button is
  not the same as consenting to it. Notices are drawn on top of the page rather
  than pushing it aside, and one said before the window is ready is held until it
  can be read.

### Changed

- **A new icon.** The mark was a status lamp reading clear; it is now that same
  lamp held level between two gauge marks, because "copacetic" means everything
  is in order and a spirit level's bubble is only centred when it is. The rule
  the interface follows is unchanged and now drawn twice: only the ring and the
  lamp take colour, the marks are white at 22%, and the tile never moves. The
  marks wash out below roughly 24px, which is deliberate — at tab-strip size
  what is left is the lamp on its own. The interface's own icon was still the
  one Next.js ships with, and is now the mark as well.

- **Building it needs Node 22.22.2 or newer.** The floor said 20.9 and was
  wrong: jsdom dropped Node 20, so on 20 the test suite does not start at all
  rather than failing a test. Nothing about the packaged application changed —
  Electron carries its own Node — but the claim was untrue and is now the one
  jsdom actually imposes.

- **A Hush tab is no longer easy to overlook.** The tab is outlined rather than
  carrying one small icon among three, the start page atmosphere goes dark, and
  the page shows what Hush does and does not do instead of the usual widgets.
  Once you have read that, the widgets that are a way to get somewhere come
  back — search, the clock — and the ones that report where you have been do
  not.
- **Addresses on your own network are left on http.** Typing
  `dev.internal:3000` upgraded it to https, where nothing was listening, with no
  way back. `.internal`, `.local` and the private ranges join loopback in being
  left alone; everything on the internet is still upgraded.

### Fixed

- **The Windows installer builds again.** Git was rewriting the filter lists'
  line endings when they were checked out on Windows, which changed their bytes,
  which made them stop matching the hashes the manifest recorded when they were
  fetched — and the build refuses to use a list it cannot verify. The lists are
  now marked as content rather than source, so they arrive byte for byte on
  every platform.
- **A menu item pressed during start-up now does what it says.** Settings,
  History, Downloads and the command palette are opened by telling the
  interface, and the interface is a page: for a couple of hundred milliseconds
  after the window appears there is nothing there to be told. The request is now
  held and handed over when the interface starts listening, once, and only if it
  was recent — a pane that opens a minute later because of a keystroke nobody
  remembers is its own bug. Switching tabs still closes whatever is covering
  them; the first state arriving no longer counts as switching, which it was
  doing, and which threw the collected pane away again on its way past.
- **A Hush tab no longer writes down the certificate of every site it opens.**
  This happened with no action from anyone, on every https page, and the record
  outlived the tab — the same shape as the favicon cache and the download, and
  against the same sentence. The certificate is still compared, so a change
  mid-session is still reported; there is simply nothing kept afterwards.
- **Zoom, permissions and blocking exceptions set in a Hush tab are no longer
  remembered.** Each is kept against a site, and Settings lists those by name.
  The cost is being asked again in the same session, which is what a tab that
  remembers nothing means.
- **Forgetting a site now removes the permissions granted to it.** They are
  stored under a key that is an origin with the permission's name stuck on the
  end, which never matched, so every permission survived being forgotten.
- **Forgetting a site no longer takes unrelated ones with it.** Two addresses
  sharing their last two numbers counted as one site, as did two things served
  from localhost on different ports.
- **A download started in a Hush tab is no longer written to disk.** Its address,
  its redirect chain and its time were going into `downloads.json`, which
  contradicts what Hush says in this README and on the tab itself — that nothing
  it does reaches the disk and closing it leaves nothing to delete. The file is
  still saved, because it was asked for; where it came from is browsing, and a
  Hush tab keeps none of that. It is listed while Copacetic is open, marked as
  not written down, and gone when Copacetic closes.
- **Clearing history now clears the icons cached for those sites.** Nobody
  chooses a favicon, and a per-origin cache left behind after clearing history
  is a readable list of where you have been.

- The connection badge no longer describes a page that failed to load as
  encrypted and verified. Nothing was exchanged and no certificate was checked.
- Stored files can change shape between versions without losing what an older
  build wrote, and a file from a newer version is kept rather than guessed at.
- Dragging a tab rightward past a group no longer puts it in that group. It came
  to rest outside the group and joined it anyway, because the drop read the wrong
  pair of neighbours in one direction of travel.
- A tab dropped where it already was is no longer re-grouped. One left ungrouped
  between two of a group's tabs was swallowed by the smallest twitch of a mouse.
- Saving a tab group as a bookmark folder no longer deletes bookmarks. A page
  already saved had its bookmark removed rather than filed, and the count did not
  say so.
- Recolouring or renaming a folder from its menu now changes what is on screen.
  It reached the disk and stopped there, because nothing told the open surface.

## 1.3.3 — 2026-08-13

### Fixed

- **Unlocking no longer promises a fingerprint macOS may not ask for.** The
  panel said "Unlock with Touch ID"; on a real machine macOS asked for the
  login password instead, which made a perfectly normal prompt look like
  something had gone wrong. macOS decides which it asks for — and on a build
  without a code-signing certificate it tends to decide password. Settings now
  says so, says the choice is macOS's rather than Copacetic's, and says
  Copacetic never sees what you type.

### Changed

- Electron 43.4.1, Next 16.3.2, esbuild 0.28.2. Patch level only.

## 1.3.2 — 2026-08-12

### Added

- **Copacetic can make you a password.** Twenty characters by default, drawn
  from the operating system's cryptographic source. `l` `I` `1` `O` `0` are left
  out, because a password that cannot be read off a screen gets written down
  somewhere worse than the vault.

  The care is in the drawing. Taking a random byte modulo the alphabet size is
  the usual shortcut and it makes the earlier characters come up more often —
  every password produced is weaker and nothing about it looks different. Bytes
  that would land unevenly are discarded and redrawn instead.

- **The vault locks.** After five minutes, or whenever you ask it to. While it
  is locked no password can be read and nothing can be exported, though what is
  saved stays listed — locked is not the same as gone.

  On a Mac, unlocking asks Touch ID. **Everywhere else it is a single click,
  and Settings says so**, because Electron gives Copacetic no way to check who
  you are on Windows or Linux and inventing a password of its own would be a
  lock built here and got wrong. Even with Touch ID this protects against
  someone at your screen, not someone with your disk: the key is in the
  keychain, and anything running as you can ask for it.

- **A section saying what the vault does not protect you from.** It shows the
  real path of the file so you can go and look; you will find the sites and
  usernames readable and the passwords not. It says that an update can cost the
  keychain entry while the builds are unsigned, and that it will never fill
  passwords into pages, because doing so means running Copacetic's code inside
  them and this browser ships without any.

## 1.3.2 — 2026-08-13

### Added

- **A generated password**, twenty characters from the operating system's
  cryptographic source, avoiding the characters people misread.

- **The vault locks.** After five minutes or on demand. Touch ID unlocks it on a
  Mac; everywhere else it is a single click and Settings says so, because
  Electron gives Copacetic no way to check who you are on Windows or Linux.

- **Copacetic can fill a saved password**, from the right-click menu on the page,
  only when you ask. It refuses a page that is not encrypted, and only offers
  passwords saved for that site — matched so that a lookalike host, or another
  user of a shared hosting domain, gets nothing.

- **A section saying what the vault does not protect you from**, showing the real
  path of the file so you can go and look.

- **Encrypted DNS, with the resolver named.** Off until chosen. Turning it on
  means your network can no longer read the names you look up and the resolver
  you picked can, which is what the setting says.

- **Copacetic tells you when a site's certificate changes** in a way worth
  knowing — specifically when the chain starts ending at a root installed on
  this machine, which is what an intercepting proxy looks like from in here. An
  ordinary renewal is not mentioned, because a browser that cries wolf is worse
  than one that says nothing.

- **Downloads record where the file actually came from** — every redirect, not
  just the last one — and the SHA-256 of what arrived, so you can check it
  against a published checksum.

- **Bookmarks can be imported** from the file any browser exports.

### Changed

- **Chromium's quiet networking is now switched off by name** rather than being
  absent by accident: background requests, component updates, reliability
  reports, link pings, cast-device discovery on your network, per-site hints,
  translation, autofill server calls and the advertising measurement stack.
  Measured with a fresh profile and every session watched: no host contacted at
  all while idle.

- The default search engine is Brave.

## 1.3.1 — 2026-08-12

### Added

- **Your passwords can leave.** Export writes the format Chrome, Firefox,
  Bitwarden and 1Password all read, and import reads what they write — any
  column order, any casing. "Everything lives on this machine" is honest and,
  on its own, also lock-in; being able to take it elsewhere is what makes the
  claim something you can act on rather than take on trust.

  The file is plain text, with every password readable in any editor. That is
  what makes it portable, so it is said in the interface before the dialog
  opens rather than hedged afterwards.

  Counts are reported rather than implied. A password that cannot be decrypted
  cannot be written to a file, so the export says how many were left out —
  leaving them out quietly is how someone believes they took everything with
  them. Import says what it added, what it replaced and what it ignored, and a
  site and username already saved has its password updated rather than
  duplicated, so importing the same file twice does not leave two of
  everything. A file with no recognisable header imports nothing at all, since
  guessing which column is which would file a username as a password.

- **A Hush tab can be opened with the mouse.** Right-clicking a tab now offers
  New Hush tab and Reopen closed tab, and a caret beside the new-tab button
  offers both. Until now it was a keyboard shortcut or the macOS menu bar and
  nothing else — and off macOS the window has no menu bar at all, which left
  the feature this browser is named around undiscoverable to anyone using a
  mouse.

## 1.3.0 — 2026-08-12

### Added

- **A place to keep a password.** Encrypted through the operating system's own
  keychain — Keychain on macOS, DPAPI on Windows, the secret service on Linux —
  one entry at a time, so a secret that cannot be read is not all of them. This
  release is storage only: Copacetic does not look at a page, does not offer to
  save what you type and does not fill anything in. Those come next, and doing
  them separately means the storage can be read and reviewed before any of the
  guessing about forms starts.

  If there is no keychain, or encrypting fails, the entry is refused rather than
  written in the clear. It is the one failure here that must never be handled
  gracefully, because a password quietly stored in plain text is worse than one
  that was never saved and said so.

  Passwords are never part of the state the interface receives. Revealing one is
  a separate request, by name, one at a time — otherwise every password would
  sit in the interface's memory for as long as Settings was open.

- **An empty vault and an unreadable one now look different.** They are not the
  same thing and the difference matters more here than anywhere else in the
  browser. Because these builds are not code-signed, macOS can treat an updated
  copy of Copacetic as a different application and refuse it the keychain entry;
  that is an ordinary consequence of an update, not a hypothetical. When it
  happens the entries are still listed, still on disk, and Settings says what
  went wrong. Reporting it as an empty list would tell someone their passwords
  were gone.

### Changed

- Settings has a Passwords section. The About answer that said there was no
  password manager has been corrected, since there now is one.

## 1.2.13 — 2026-08-11

### Fixed

- **Automatic updates never worked.** On Windows and the Linux AppImage the
  updater was loaded with `const { autoUpdater } = await import(...)`, and
  because `electron-updater` is CommonJS with exports that cannot be detected
  statically, that gave `undefined`. The first property set on it threw, inside
  the try/catch around the check, so it surfaced as an error message rather
  than a crash — and updates did nothing at all from 1.1.0 until now. Every
  test passed because they covered which platform gets which behaviour rather
  than the updater itself.

### Changed

- Electron 41 to 43, which brings Chromium 142 to 150. Chromium currency is a
  security property in a browser: every fix that lands upstream stays
  exploitable here until this moves. Checked by re-running the live proofs on
  the new version — bad certificates still refused, the Hush partition still
  writes nothing, HTTP authentication still reaches its handler.
- Dependabot raises a weekly pull request for dependencies and a monthly one
  for actions, with Electron and the framework packages kept out of the grouped
  batch so they are read rather than skimmed.
- CI reports known vulnerabilities as a warning rather than a failure, and
  keeps the packaged tree when packaging fails — a platform-specific packaging
  failure otherwise needs that platform to reproduce, which for two of the
  three is not something anyone here has.

## 1.2.12 — 2026-08-11

### Added

- **Hush tabs.** `Cmd/Ctrl+Shift+N`, or New Hush tab in the menu. Your machine
  forgets one entirely: no history, no cookies, no cache, no favicons, and
  nothing written to disk at all — not even the list of tabs to reopen, and it
  cannot be brought back with reopen-closed.
- It says outright what it does not do. A Hush tab does not make you anonymous:
  the sites you visit, your network, your employer and your internet provider
  see exactly what they would see in any other tab. That sentence is the reason
  this is worth shipping rather than the thing to bury — believing otherwise is
  the best-known misunderstanding in any browser, and this one cannot repeat it.
- Not called incognito or private, because both words promise more than any
  browser delivers.
- The tab is marked in the strip, since the whole value depends on knowing
  which tab you are in.

### Internal

- A Hush tab runs in an in-memory session rather than a persisted one that gets
  cleaned up afterwards: a mode that writes and then deletes is one crash away
  from not having deleted. Verified in Electron — after a cookie and a flush,
  the persistent partition had written 17 files and the Hush one none.
- Every guard is installed on the Hush session separately. A separate session
  means the tab promising the most would otherwise run with the least
  protection: no permission handling, no tracker blocking, no certificate
  reporting.

## 1.2.11 — 2026-08-11

### Fixed

- The build no longer depends on Google being reachable. Fonts were fetched
  from Google Fonts at build time, so a failed request failed the build — which
  is how 1.2.10 shipped without its Linux packages, leaving AppImage update
  checks with no file to read. The font files are committed and served from the
  app itself, which is 84KB and removes the last thing in a browser about who
  your machine talks to that needed Google's permission to compile.
- 1.2.10's Linux installers are published here instead. Its macOS and Windows
  builds were unaffected.

## 1.2.10 — 2026-08-11

### Internal

- The security model has tests. Permission resolution, the synchronous check
  that must never prompt, the outright refusal of device access, popups being
  turned into tabs, the navigation guard, the webview refusal and the chrome
  document's own guards were all untested — the parts most expensive to get
  wrong, and the ones where a regression fails open rather than loudly. The
  code's own comment called the sender check "the belt"; the belt had nothing
  holding it.
- `persistence.ts` has tests: the fallback when a file is missing, the
  quarantine that moves a malformed file aside instead of overwriting it, the
  atomic write leaving no temporary file behind, and the debounce that keeps a
  file off the disk until it settles or the app quits.
- Both were checked by breaking them: making the device handler allow, and
  letting a page navigate anywhere, each fail the suite.

## 1.2.9 — 2026-08-11

### Accessibility

- A surface keeps the keyboard inside it. Panels cover the page but the page
  kept its place in the tab order, so Tab walked out of the open panel into
  controls nobody could see — nothing looked wrong, focus simply vanished. The
  page behind is now inert as well, and focus returns where it came from when
  the panel closes.
- The address bar announces itself as a combobox with a list attached, and says
  which suggestion the arrow keys are on. The suggestions were invisible to a
  screen reader before, which made the arrow keys seem broken rather than
  absent.
- A live region reports what happens away from the keyboard: a page starting
  and finishing loading, a site asking for permission, a download completing.
  Politely, so it waits for a gap rather than interrupting.

## 1.2.8 — 2026-08-11

### Performance

- A state push no longer re-renders the whole interface. The main process sends
  the entire browser state on every change, freshly deserialised, so every part
  of it was a new object even when nothing about it differed — and selectors
  compare by reference. One download's byte counter was re-rendering every tab,
  the settings panel and the connection panel, several times a second, on the
  thread that also handles typing. Each slice is now compared with the one it
  replaces and keeps its reference when they match, per tab as well as per
  slice, so one tab finishing loading re-renders one tab.
- Download progress is reported on the speed-sample interval rather than every
  time Chromium fires an event. The sample was already throttled; the state
  push it triggered was not. A status change — pausing, resuming, an
  interruption — is still reported instantly, because that should never look
  like it did nothing.
- The bookmarks surface draws 200 rows at a time and says how many it is
  showing. It was the one list in the interface with no ceiling: history is
  paged and downloads are capped, but bookmarks only ever grow.

## 1.2.7 — 2026-08-11

### Added

- `sudo apt install copacetic` works on a machine that has never seen it. The
  signing key and a ready-made source file are published alongside the
  repository, so adding it is two commands and installing is the third. The
  fingerprint is published too, because fetching a key over the network and
  trusting it without checking is not something to recommend.

### Changed

- Settings says the package manager handles updates on a `.deb`, which is now
  true: the package registers the signed repository and `apt upgrade` carries
  new versions.

## 1.2.6 — 2026-08-11

### Added

- The start page is made of widgets you choose and order: a clock, the search
  box, most-visited sites, and a new strip of recent bookmarks. Add, remove and
  move them in Settings.
- Reordering is buttons rather than dragging, so it works without a mouse and
  "down" means one thing rather than depending on where you let go.
- The two start-page toggles this replaces are carried over on upgrade, so an
  existing setup survives rather than resetting to the default.

### Changed

- Debian packages are published to object storage rather than a git branch, so
  the `.deb` registers a working apt source again and upgrades arrive with
  `apt upgrade`. The repository is checked before any installer is built, so a
  package can never go out pointing at a source that does not work.

## 1.2.5 — 2026-08-11

Released as one version rather than two: 1.2.4 went out only as a prerelease,
and the settings fix below is what makes its tracker allowlist work at all.

### Fixed

- Several settings did nothing. The IPC handler validates an incoming settings
  patch against a whitelist, which is right, but it silently dropped any field
  not on it — so the control moved, the change was discarded, and it looked
  like it had worked. Compact density, the update-check toggle, the tracker
  allowlist and resetting a site's zoom were all affected. The update-check
  toggle had been inert since 1.1.0.
- A test now asserts the whitelist covers every field of `Settings` except the
  ones deliberately refused, so a setting added without being made changeable
  fails the build rather than shipping as a control that does nothing.

### Added

- Settings is grouped into sections behind a rail — Appearance, Search,
  Privacy, Behaviour, Your data, Keyboard, Updates and About — rather than one
  page that grew every release. One pane shows at a time, so looking for one
  thing means reading one pane.
- An About section that answers what people actually ask: whether Copacetic
  tracks you, whether it phones home, what the address bar sends, where your
  data is, why a site might look broken, why Netflix will not play, why there
  are no extensions, and whether passwords are stored.
- A plain disclaimer in the same place: Chromium does the rendering and the
  certificate validation, the project has not been security audited, the builds
  are not code-signed, and there is no warranty. All of it was already true and
  already written in the README — this puts it where someone might read it.
- Tracker blocking can be switched off for one site, from the connection panel
  where the blocked count already is. Blocking occasionally breaks something
  real — a login routed through an analytics domain, an embed that will not
  load — and without a per-site answer the only fix was turning blocking off
  everywhere, which is a far worse trade than the one anyone wanted to make.
  Allowed sites are listed in Settings with a way back.
- What was allowed through is still recorded, so the connection log stays
  honest about a site you chose not to block on.
- A wallpaper for the start page. The image is copied into your profile and
  resized on the way in, so moving the original later does not blank it and a
  large photograph does not become a large read on every new tab. The start
  page dims it so the clock and search field stay readable.
- Settings shows a preview of the wallpaper, dimmed exactly as the start page
  dims it, so what you are looking at is what you will get rather than a
  flattering portrait of it. The preview is generated small on demand rather
  than loading the full image into Settings.
- The start page is the only surface that gets this. It is not chrome and
  nothing on it reports state, which is exactly why colour is free there and
  fixed everywhere else.

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
