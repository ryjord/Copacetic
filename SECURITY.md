# Security policy

Copacetic renders hostile content by design, and it holds passwords. If you have
found something that undermines either, this is how to say so.

## Reporting a vulnerability

Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/ryjord/Copacetic/security/advisories/new).
It opens a private thread visible only to you and the maintainer.

Please do not open a public issue for a suspected vulnerability. A public issue
is a working description of the problem, available to everyone, before there is
a version that fixes it.

Useful things to include, in rough order of usefulness:

- What an attacker gains — reading a password, escaping the page sandbox,
  reaching the file system, making the interface say something untrue.
- The steps to reproduce it, and the version and platform you saw it on.
- A page or file that demonstrates it, if one is needed.

## What to expect

Copacetic is maintained by one person, so a promise of a same-day response would
be a promise that gets broken. What is realistic:

- An acknowledgement within a week.
- An assessment of severity and whether it is in scope shortly after that.
- A fix in a release, with credit in the changelog if you would like it. Say so
  if you would rather not be named.

If you have not heard anything in two weeks, assume it was missed rather than
ignored, and send a reminder on the same thread.

## Supported versions

The most recent release. There are no long-term support branches, and a fix
means a new version rather than a patch to an older one.

## Scope

**In scope** — anything in this repository, and particularly:

- Escaping a page's sandbox, or reaching the main process from page content.
- Reading vault entries without the vault being unlocked, or getting a password
  out of the app by a route other than filling it into the page you asked for.
- Getting the interface to fill a credential into a page it does not belong to.
- The IPC boundary: making the main process act on a message that did not come
  from the chrome window.
- Making the interface state something false about a connection, a certificate,
  a permission, or what has been stored.
- Reading browsing history or Hush activity from disk after it was supposed to
  have been left unwritten.

**Out of scope** — not because they do not matter, but because a report here
cannot fix them:

- Vulnerabilities in Chromium or Electron themselves. Report those upstream; if
  you believe Copacetic is exposing one it otherwise would not, that is in scope
  and worth saying.
- The things the README already states plainly under
  [Security](README.md#security) and _What it does not do_ — the builds are
  unsigned, there is no extension support, and this has not been through a
  security audit. Those are known, stated, and not findings.
- Anything requiring an attacker who already has an account on the machine and
  can read `userData` directly. At that point the operating system's protections
  have already failed, and the keychain is doing what it can rather than what it
  cannot.

## If you are testing

Test against your own installation and your own data. Do not test against other
people, and do not use a finding to reach anything that is not yours. Work
within that and a report is welcome, whatever it turns out to be.
