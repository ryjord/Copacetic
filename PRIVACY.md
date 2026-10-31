# Privacy policy

Last updated 31 October 2026. Applies to Copacetic 2.2 and later.

Copacetic is a web browser that keeps what you do on your own computer. It has
no account, no analytics, no telemetry and no crash reporting. Its developer
receives nothing about you or how you use it, unless you choose to send an
email.

The same facts are in the browser itself, under Settings > What it sends,
written against the version you are running.

## What stays on your computer

Copacetic keeps these in its folder in your user profile, and nowhere else:

- **History**: the pages you visited, for 90 days unless you change it in
  Settings > General.
- **Bookmarks**, the list of downloads, and what you decided for each site,
  such as its zoom, its permissions and whether trackers are allowed on it.
- **Settings**, in a file you can read in any text editor.
- **Passwords and addresses you save**, each one encrypted with a key held by
  your operating system's keychain (the macOS Keychain, Windows' own store, or
  GNOME Keyring or KWallet on Linux). On Linux with no keyring running,
  nothing can be saved.
- **Cookies, cache and site data** that the sites you visit store, as any
  browser does.
- **A diagnostics log** of what Copacetic did, such as that it started or that
  a setting would not save. Addresses are cut down to their scheme before they
  are written, so it never names a page you visited. Nothing sends it anywhere.

A Hush tab keeps none of this: no history, cookies, cache, icons or reopen
list.

You can export your bookmarks, history and passwords, and clear any of it, in
Settings > Your data and Settings > Passwords. Removing Copacetic's folder
removes all of it. On macOS and Linux the key that sealed your passwords stays
in the keychain or keyring, as "Copacetic Safe Storage", until you delete it
there.

## What leaves your computer, and to whom

Copacetic contacts these on its own, and only these:

| What                                      | Who receives it                     | When                                                                                                     | Can you turn it off           |
| ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Update check                              | GitHub (api.github.com, github.com) | Shortly after start, then every six hours                                                                | Yes, in Settings > Updates    |
| Installer download (macOS)                | GitHub                              | Only when you press Download and open                                                                    | Not needed                    |
| Extension updates                         | Google's Chrome Web Store           | Every six hours, once a profile has an extension from it; it is told the extensions' ids, as Chrome does | Yes, in Settings > Extensions |
| Filter lists                              | easylist.to and secure.fanboy.co.nz | Only when you press Check now                                                                            | Not needed                    |
| Spelling dictionaries (Windows and Linux) | Google                              | Once per language, the first time it is used; nothing you type is sent                                   | Yes, by turning spelling off  |
| Translation models                        | Mozilla                             | Once per language, the first time you translate from or into it; what you read is never sent             | Not needed                    |

The update check and downloads send nothing about you beyond what any
connection reveals, such as your IP address, which the receiving service
handles under its own privacy policy.

Ordinary browsing contacts what you ask it to:

- **The sites you visit**, which see you as they would in any browser. Copacetic
  blocks known trackers and advertising, third-party cookies and tracking
  parameters in links by default, and hides cookie banners without answering
  them for you.
- **Your search engine** (Brave Search unless you change it), only when you
  press Enter on something that is not a web address. Suggestions while you
  type come from your own history and bookmarks, worked out on your computer.
- **A secure DNS provider** (Quad9, Cloudflare or Mullvad), only if you choose
  one in Settings > Privacy. Otherwise your system's DNS is used.
- **Extensions you add**, which run their own code under their own policies.

## What the developer receives

Nothing, unless you write. Help > Send feedback opens your own email program
with a message to contact@mrenigma.uk, filled in with Copacetic's version,
your operating system and its architecture so a problem can be reproduced.
Nothing is sent until you press send, and you can edit or delete any of it
first. Emails are used only to answer you and to fix what you report, and are
not shared.

## Children

Copacetic is a general-purpose browser and does not knowingly collect anything
from anyone, children included, since it collects nothing at all.

## Changes

A change to this policy is listed in the release notes of the version that
makes it, and the date above moves.

## Contact

contact@mrenigma.uk
