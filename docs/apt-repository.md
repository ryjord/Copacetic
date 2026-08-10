# The apt repository

`.deb` builds update through `apt`, from a signed repository published on
GitHub Pages. This is how Chrome and VS Code do it, and it is the only way a
Debian package can update itself without going behind `dpkg`'s back.

The alternative — the app downloading a `.deb` and asking for root to install
it — was rejected deliberately. A browser that executes a downloaded package
with elevated privileges is exactly the shape of thing this project exists to
argue against.

## What it costs

Nothing. GitHub Pages hosts the repository, and the signing key is one you
generate yourself. There is no certificate to buy — unlike macOS code signing,
apt repository signing uses plain GPG.

## Current setup

Done on 10 August 2026. Recorded here so the details are not folklore.

|              |                                                     |
| ------------ | --------------------------------------------------- |
| Key ID       | `D729BEB377078736`                                  |
| Fingerprint  | `FAF1 C904 0138 53AA 76EA 0E06 D729 BEB3 7707 8736` |
| Secret       | `APT_GPG_PRIVATE_KEY` on `ryjord/Copacetic`         |
| Repository   | <https://ryjord.github.io/Copacetic/apt>            |
| Pages branch | `gh-pages`, serving from `/`                        |

**Back the private key up.** It lives in `~/.gnupg` on one machine and nowhere
else. If it is lost, every installed copy stops trusting the repository and the
only remedy is for each user to reinstall by hand. Export it and put it
somewhere durable — a password manager, not a folder:

```bash
gpg --armor --export-secret-keys D729BEB377078736
```

Treat that output like a password. Anyone holding it can publish a package that
every Copacetic installation will accept as genuine.

## Repeating the setup from scratch

Only needed for a fork, or if the key is ever lost and has to be replaced.

### 1. Generate a signing key

Use a key with no passphrase: CI cannot type one. It signs nothing but this
repository's indexes, so keep it separate from any personal key.

```bash
gpg --batch --gen-key <<'EOF'
Key-Type: RSA
Key-Length: 4096
Name-Real: Copacetic Archive Signing Key
Name-Email: rileyjordan21@hotmail.com
Expire-Date: 0
%no-protection
%commit
EOF
```

Find its ID:

```bash
gpg --list-secret-keys --keyid-format=long
```

### 2. Store the private half as a repository secret

```bash
gpg --armor --export-secret-keys <KEY_ID> | gh secret set APT_GPG_PRIVATE_KEY --repo ryjord/Copacetic
```

The release workflow reads `APT_GPG_PRIVATE_KEY`, exports the public half into
the `.deb`, and signs the repository indexes with it. Without that secret the
workflow skips the whole thing and the `.deb` installs without touching apt, so
a fork still builds a working package.

Back the private key up somewhere safe. Losing it means every existing
installation stops trusting the repository, and the only fix is for users to
reinstall by hand.

### 3. Turn on GitHub Pages

Settings → Pages → **Deploy from a branch** → branch `gh-pages`, folder `/`.

The branch does not exist until the first release publishes it, so do this
after the first tagged release, or create an empty `gh-pages` branch first.

## What a release does

1. `guard` refuses the tag if it disagrees with `package.json`.
2. Each platform builds and uploads its installers.
3. `apt` downloads the new `.deb`, adds it to the pool alongside every previous
   one, regenerates `Packages` and `Release`, signs them, **verifies the
   signature it just made**, and pushes to `gh-pages`.

The pool is preserved rather than rebuilt, so anyone still on an older version
can continue to install it.

## What installing the `.deb` does

`build/deb/after-install.sh` writes two files:

- `/usr/share/keyrings/copacetic-archive-keyring.gpg` — the public key
- `/etc/apt/sources.list.d/copacetic.sources` — the source, in deb822 format,
  with `Signed-By` pointing at that keyring

`Signed-By` matters: it binds the key to this one repository, so the key cannot
vouch for anything else on the system. A key added to the global trusted set
could sign a package claiming to be any other.

Purging the package removes both. A plain `remove` leaves them, because an
upgrade is a remove followed by an install and tearing down the source in
between would strand apt mid-upgrade.

## Checking it worked

On a Debian or Ubuntu machine, after installing the `.deb`:

```bash
apt policy copacetic          # should list the GitHub Pages origin
apt update && apt list --upgradable
```

If `apt update` complains the repository is not signed, the release ran without
`APT_GPG_PRIVATE_KEY` set.
