# Copacetic

A desktop browser that tells you the truth about the page you are on.

Copacetic renders pages with Chromium, through Electron. It is a browser
_interface_, not a browser _engine_ — the rendering, networking and sandboxing
belong to Chromium. What Copacetic adds is the part you actually touch: the tab
strip, the address bar, the permission prompts, and a set of decisions about
what a browser should and should not do on your behalf.

![Copacetic's start page](docs/screenshot-start.png)

---

## Why it exists

Most browser UI hides the state of the page behind a padlock that means very
little. Copacetic has one rule that shapes the whole interface:

> **The chrome is monochrome. Colour only ever appears where it carries state.**

If something is green it is because the connection is genuinely encrypted. If
the address bar says "Not secure", the page really is being served over plain
HTTP. There is no decorative accent colour anywhere in the interface, so the one
place colour appears is the one place worth looking.

## What it does

**Addresses you can actually read.** The address bar is not a text field until
you click it. It renders the URL structurally, with the registrable domain at
full contrast and everything else dimmed, in a monospace face. So
`paypal.com.attacker.net/login` reads as **attacker.net** — which is the point.
Which part counts as the domain comes from the full IANA Public Suffix List, so
`user.github.io` and `example.pvt.k12.ma.us` are read correctly rather than
approximated, and two projects sharing a host never look like the same site.

**Honest connection reporting.** Click the badge in the address bar for the real
scheme, the host, the measured load time, how many tracker requests were blocked
on this page, and — on an encrypted connection — who issued the certificate and
when it expires. An expiry inside a fortnight is the one thing there that turns
amber, because it is state you cannot see any other way. When Copacetic cannot
describe a connection, it says so rather than guessing.

**It tells you when something is reading your connection.** If a site's
certificate chains to a root installed on this machine rather than one your
system shipped with — a company proxy, antivirus, or a debugging tool
intercepting TLS — the panel says so. Every mainstream browser shows the same
padlock in that situation as in any other.

**Every host a page contacted, not just the blocked ones.** The connection panel
lists each host the page actually talked to, how many requests went to it, and
which were stopped. The blocked count tells you what was prevented; this tells
you what was allowed, which is the half no mainstream browser shows without
opening developer tools.

**Ad and tracker blocking from a list that never phones home.** EasyList and
EasyPrivacy ship inside the app — 136,716 rules — with a curated list of 122
domains underneath them as a floor, so a list that fails to load cannot make
Copacetic block less than it did before it had one. The rules are in the
repository as text, and the only thing that changes them is a release, or you
pressing "Check for newer lists" in Settings. Nothing fetches them on a timer:
that would be a periodic request from your machine to a server, which is the
shape of the thing being blocked.

The count you see is the real number of blocked requests, not an estimate, and
the connection panel says whether a hostname or a rule stopped each one. Adverts
served from the page's own address, inserted by the server, or written into a
feed are not blocked and cannot be — Settings says so rather than counting past
them. Top-level navigation is never blocked, so you can still visit a tracker
domain deliberately, and if blocking breaks a site you can allow it there rather
than turning blocking off everywhere.

**Local-only suggestions.** As you type, the list under the address bar is
ranked from your own history and bookmarks, in the main process. No keystroke is
sent anywhere to fetch remote suggestions.

**Downloads with real controls.** Pause, resume, cancel, open, reveal in the
file manager. Live throughput and time remaining. Filenames are sanitised
against directory traversal and against right-to-left override tricks that
disguise an `.exe` as a `.jpg`.

**Sites that ask you to sign in.** HTTP authentication — the challenge
intranets, routers, NAS boxes and plenty of dev servers use — is answered
through a prompt in the chrome. Copacetic only asks when the challenge comes
from the site the address bar is showing, or from the proxy for your network;
a subresource on some other origin asking for a password gives you nothing to
judge. What you type into that prompt is not kept: Passwords holds only what
you put there yourself, and an HTTP challenge is not one of them.

**A start page you assemble.** A clock, a search box, your most-visited sites
and your recent bookmarks — pick which of them appear and in what order, and
put a wallpaper behind them. It is the one surface where colour is free,
because nothing on it is reporting state.

**Hush tabs.** `Cmd/Ctrl+Shift+N` opens a tab your machine forgets: no history,
no cookies, no cache, no favicons, nothing written to disk. It is not called
incognito or private, because it does not make you anonymous — the sites you
visit and your network see you exactly as they otherwise would, and Copacetic
says so in the tab rather than leaving you to assume otherwise.

**Zoom it once.** Zooming a site is remembered for that site, so a page you
need larger arrives larger every visit. Settings lists everywhere you changed
it, with a reset each.

**The rest of what a browser needs.** Tab drag-reorder, middle-click close,
audio indicators and per-tab mute, find-in-page with match counts, per-tab zoom,
session restore, a command palette (`Cmd/Ctrl+K`), native context menus, and a
full application menu so copy/paste and every shortcut behave the way the
platform expects.

## Security

The threat model is the obvious one: Copacetic renders hostile content by
design. The measures below are the ones that follow from that. To report
something that gets past them, see [SECURITY.md](SECURITY.md).

| Concern                              | What Copacetic does                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page code reaching the app           | Tabs run with `sandbox: true`, `contextIsolation: true`, no `nodeIntegration`, and **no preload script at all**                                                                                                                                                           |
| Renderer compromise reaching the OS  | The chrome renderer is sandboxed too; every IPC handler rejects messages that did not come from the chrome window's own top-level frame                                                                                                                                   |
| Page data reaching the chrome        | Web content lives in its own persistent session partition, separate from the session running the interface                                                                                                                                                                |
| Chrome renderer being navigated away | `will-navigate` is refused for anything that is not the app's own document, so the preload bridge can never be handed to a remote origin                                                                                                                                  |
| Popups imitating browser chrome      | `setWindowOpenHandler` denies every window. Pages get a tab, never a window                                                                                                                                                                                               |
| Dangerous URL schemes                | `javascript:`, `data:`, `blob:`, `vbscript:` and `filesystem:` are refused for top-level navigation, from the address bar and from page code alike — and are never handed to another application instead. `file:` is yours to type, but page code cannot send a tab there |
| `<webview>` injection                | Disabled in `webPreferences` _and_ refused in `will-attach-webview`, so the guarantee does not rest on one options object staying correct                                                                                                                                 |
| Over-broad permissions               | Device access (serial, HID, USB), ambient signals (idle detection, local fonts, window placement) and cross-site storage are denied outright, without a prompt. Only permissions a user can meaningfully evaluate are ever asked about                                    |
| Favicon requests leaking             | Favicons are fetched by the main process in the web session and handed to the interface as data URLs, so the chrome renderer never makes a network request. A remote page cannot name a loopback or private-network host and have that request made on its behalf         |
| Chrome document XSS                  | A strict CSP with `default-src 'none'`, `connect-src 'self'`, `object-src 'none'` and `frame-ancestors 'none'`                                                                                                                                                            |
| Certificates on this machine         | A development server's unsigned certificate is accepted for `localhost`, `127.0.0.1`, `::1` and `.localhost`, and nowhere else — reaching that traffic means already being on the machine. The badge says the certificate was not checked rather than claiming it was     |
| Malicious download filenames         | Path components, control characters and bidirectional overrides are stripped before a file is written                                                                                                                                                                     |

Copacetic presents a plain Chrome user agent rather than advertising Electron:
better site compatibility, and one less signal that fingerprints you as unusual.
Chromium's client hints are corrected to match it, because Electron otherwise
describes the browser as Chromium while the user agent says Chrome — and a
browser that disagrees with itself is both a fingerprinting signal and the
reason some sign-in pages refuse it. The correction is made in the main process
through the DevTools protocol; page content still runs no script of ours.

### What it does not do

Being straight about the gaps, since the whole project is about not overstating
things:

- **Nothing is fetched at build time either.** The fonts are committed rather
  than downloaded, so building Copacetic needs no network and no third party.
- **No sync, no accounts, no cloud.** Everything lives in `userData` on this
  machine, and Settings will write your bookmarks and history back out —
  bookmarks in the format every browser imports, history as plain JSON — so
  that is a statement you can check rather than take on trust. The one request Copacetic makes on its own behalf is the update
  check, which reads a version number from the GitHub releases API and sends
  nothing about you. It can be turned off in Settings.
- **No extension support.** Chrome extensions are not loaded.
- **No DRM.** Widevine is not bundled, so Netflix and Spotify will not play.
- **Certificate inspection is Chromium's.** The badge reports the issuer and
  expiry of the certificate Chromium accepted; it does no chain analysis of its
  own, and a certificate Chromium rejected is never described at all — a failed
  connection must not be dressed up as an informative one.
- **Not audited.** A personal project built to a high standard, not a browser
  that has been through security review.

## Being the default browser

Copacetic declares that it can open `http` and `https`, so the system will offer
it. Settings has a control that says what your platform will actually allow:
macOS and Linux can be asked directly, and **Windows 10 and 11 do not let an
application make itself the default at all** — there the control opens the
screen where you choose, rather than claiming to have done something it cannot.

Nothing registers itself at startup. An address handed over by another
application goes through the same check as a link on a page, so a `file:` or
`javascript:` argument on the command line does not become a tab.

## Checking a download is what it claims to be

The builds are not code-signed, so nothing in the installer says who made it.
What can be answered — and for nothing — is whether the file you downloaded is
the one this repository built. Every release is attested by GitHub, and the
attestation names the commit and the workflow run it came out of:

```
gh attestation verify Copacetic-1.3.3.dmg --repo ryjord/Copacetic
```

That does not make a download trusted. It makes it checkable, which is what an
unsigned build otherwise cannot offer at all: a file that was tampered with in
transit, or served from somewhere that is not this repository, fails the check.

## Architecture

Page content is owned by the **main process** as one `WebContentsView` per tab.
The renderer is pure interface — it never touches page content, and it holds no
browser state of its own.

```
electron/
  main/
    index.ts          app lifecycle, single-instance lock
    browser.ts        orchestrator; every command menus and IPC call into
    tabs.ts           WebContentsView per tab, navigation, find, favicons
    security.ts       session hardening, navigation guards, permission policy
    blocker.ts        tracker blocking and per-tab counting
    downloads.ts      pause/resume/cancel, filename sanitising
    store.ts          history, bookmarks, settings, session (atomic JSON)
    menu.ts           application menu — also the keyboard shortcut table
    context-menu.ts   native page and tab menus
    protocol.ts       serves the exported interface over copacetic-app://
    ipc.ts            typed, sender-validated handlers
  preload/index.ts    the only bridge; forwards no caller-supplied channel
  shared/             types, channel names and URL logic used by both sides
src/                  Next.js interface (static export, no server)
```

Two consequences of `WebContentsView` shape the interface, and both turned out
to be improvements:

- **A native view always paints above the renderer's HTML.** So the address-bar
  suggestion list and the find bar are not floating popovers — they are real
  chrome, and the page is pushed down to make room. Full-area panels (settings,
  history, downloads) hide the tab view instead of covering it.
- **The renderer measures its own layout** and reports the content rectangle to
  the main process, which parks the tab view exactly over the hole. Resizing is
  handled in the main process from cached insets, so it never lags a round trip
  behind.

## Download

Installers for macOS, Windows and Linux are on the
[latest release](https://github.com/ryjord/Copacetic/releases/latest):
`.dmg` (macOS, arm64 and x64), `Setup.exe` (Windows) and `.AppImage` / `.deb`
(Linux). Builds are not code-signed, so expect an "unidentified developer" or
SmartScreen prompt on first launch.

On macOS, Gatekeeper will refuse the app outright rather than just warning.
Right-click the app and choose Open, or clear the quarantine flag:

```bash
xattr -cr /Applications/Copacetic.app
```

### Installing on Debian or Ubuntu

Add the repository once, and Copacetic installs and updates like any other
package:

```bash
sudo curl -fsSL https://pub-4eb7b3b013b1424caf0cfa2c570bcc61.r2.dev/copacetic-archive-keyring.gpg \
  -o /usr/share/keyrings/copacetic-archive-keyring.gpg
sudo curl -fsSL https://pub-4eb7b3b013b1424caf0cfa2c570bcc61.r2.dev/copacetic.sources \
  -o /etc/apt/sources.list.d/copacetic.sources
sudo apt update && sudo apt install copacetic
```

You are trusting a key fetched over the network there, so check it is the one
that actually signs these packages before you do:

```bash
gpg --show-keys --with-colons /usr/share/keyrings/copacetic-archive-keyring.gpg | awk -F: '/^fpr/{print $10; exit}'
# FAF1C904013853AA76EA0E06D729BEB377078736
```

`Signed-By` in that source file binds the key to this repository alone, so it
cannot vouch for any other package on your system. Installing the `.deb` by
hand does the same thing — the package registers the source itself — so this is
only needed on a machine that has never had Copacetic on it.

### Staying up to date

Copacetic checks whether a newer release exists and shows what it finds in
Settings. What it can do about it depends on the build, and it says so rather
than pretending:

| Build                 | What happens                                            |
| --------------------- | ------------------------------------------------------- |
| Windows (`Setup.exe`) | Downloads in the background, installs when you quit     |
| Linux (`.AppImage`)   | Downloads in the background, installs when you quit     |
| macOS (`.dmg`)        | Tells you a version is available and links the download |
| Linux (`.deb`)        | Tells you, and links the download — manual for now      |

macOS is manual because installing an update in place requires a code-signed
app, and Copacetic is not signed. That is a cost decision, not an oversight,
and it is stated in Settings rather than hidden behind a button that fails.

The `.deb` never updates itself, because the file belongs to `dpkg`. It
registers Copacetic's own signed repository instead, so new versions arrive
with a normal `apt upgrade` — the same way everything else on the machine is
updated. The repository is signed with a key bound to that one source, so it
cannot vouch for any other package.

If you want updates handled for you on Linux today, use the `.AppImage`, which
updates itself in place.

## What it costs to run

Measured rather than claimed, with `npm run measure`, which launches the built
app on a throwaway profile five times and reports the median. The numbers below
came off one machine and are not a promise about yours — the point is that you
can produce your own on the same script. The memory figures need pages, so that
one measurement opens five on example.com; nothing else in it uses the network.

|                                                   |                          |
| ------------------------------------------------- | ------------------------ |
| Start to a window you can see                     | 409ms                    |
| Start to a window that answers                    | 604ms                    |
| Blocking engine, loaded on launch                 | 6ms, for 136,716 rules   |
| Blocking engine, built from the raw lists instead | 252ms                    |
| Memory, just the start page                       | 634MB                    |
| Memory, five pages open                           | 1,141MB, so 101MB a page |

`Apple M4 Pro, 14 cores, 48GB RAM, Electron 43.4.1, macOS arm64.`

Three of these are worth saying plainly rather than leaving in a table.

The gap between a window you can see and a window that answers is about 190ms,
and it is a real thing rather than a rounding error: a keystroke or a menu item
inside it used to reach a renderer that was not listening yet. That is fixed by
holding the request, not by pretending the gap is not there. A cold first launch
is slower throughout — around 900ms to a window that answers — rather than
having a wider gap.

The engine is built when the app is packaged and read back on launch, which is
why the first blocking number is 6ms and not 250ms. Building it from the lists
at every start would put a quarter of a second on every launch to arrive at the
same engine.

Memory is the number most browsers quote in the way that flatters them. This one
is every process the app is running added together, because that is what the
machine actually gives up. Most of it is Chromium, and most of the per-page cost
is a renderer process, which is the price of pages not sharing one.

## Running it

Requires Node 22.22.2 or newer. The floor is jsdom's, which the test suite
uses; the suite does not start at all below it. CI runs Node 22.

```bash
npm install
npm run dev      # Next dev server + main process watch + Electron
```

Build and run the production path:

```bash
npm run build
npm start
```

Package a distributable into `release/`:

```bash
npm run package
```

### Checks

```bash
npm run verify   # format check, lint, typecheck (3 projects), unit tests
```

Unit tests cover the parts where being wrong is expensive: address resolution
(including every dangerous-scheme case), registrable-domain extraction for the
address bar, tracker matching, and download filename sanitising.

## Keyboard

|                                   |                                   |
| --------------------------------- | --------------------------------- |
| `Cmd/Ctrl+T` / `Cmd/Ctrl+W`       | New tab / close tab               |
| `Cmd/Ctrl+Shift+T`                | Reopen the last closed tab        |
| `Cmd/Ctrl+L`                      | Focus the address bar             |
| `Cmd/Ctrl+K`                      | Command palette                   |
| `Cmd/Ctrl+F` / `Cmd/Ctrl+G`       | Find on page / find next          |
| `Cmd/Ctrl+R` / `Cmd/Ctrl+Shift+R` | Reload / reload ignoring cache    |
| `Cmd/Ctrl+[` / `Cmd/Ctrl+]`       | Back / forward                    |
| `Cmd/Ctrl+D`                      | Bookmark this page                |
| `Cmd/Ctrl+1`…`8` / `Cmd/Ctrl+9`   | Select tab by position / last tab |
| `Cmd/Ctrl+Y` / `Cmd/Ctrl+Shift+J` | History / downloads               |
| `Cmd/Ctrl+ +` / `-` / `0`         | Zoom in, out, reset               |

## Where your data lives

Plain JSON in Electron's `userData` directory, written atomically:
`settings.json`, `history.json`, `bookmarks.json`, `downloads.json`,
`favicons.json`, `session.json`, `window.json`. History older than 90 days is
dropped on launch. A corrupt file is moved aside rather than blocking startup.

- macOS: `~/Library/Application Support/Copacetic`
- Linux: `~/.config/Copacetic`
- Windows: `%APPDATA%\Copacetic`

## Licence

MIT. See [LICENSE](LICENSE).

Not everything in here is Copacetic's to license, though. The EasyList and
EasyPrivacy filter lists are shipped whole, are someone else's work, and carry
the GPLv3 or CC BY-SA 3.0, whichever is elected. [NOTICE](NOTICE) names what
they are, where they came from and under what terms — which matters if you fork this, and matters
more if you sell it.
