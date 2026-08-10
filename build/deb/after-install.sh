#!/bin/sh
# Registers Copacetic's own apt repository, so `apt upgrade` keeps the browser
# current the same way it keeps everything else current.
#
# A .deb is owned by dpkg, so the app must never overwrite itself. Pointing apt
# at a signed repository is the supported way round that, and it is what Chrome
# and VS Code do. The alternative — an in-app installer asking for root on
# every update — is a far worse thing to put in a browser.
set -e

KEYRING_DIR=/usr/share/keyrings
KEYRING="$KEYRING_DIR/copacetic-archive-keyring.gpg"
SOURCE=/etc/apt/sources.list.d/copacetic.sources
SHIPPED_KEY=/opt/Copacetic/resources/copacetic-archive-keyring.gpg

# Built without a signing key (a local `npm run package`, or a fork without the
# secret configured). Without a key the repository cannot be verified, and an
# unverified apt source is worse than none, so leave the system alone.
if [ ! -f "$SHIPPED_KEY" ]; then
  exit 0
fi

mkdir -p "$KEYRING_DIR"
install -m 0644 "$SHIPPED_KEY" "$KEYRING"

# deb822 format, so the signing key is bound to this one source rather than
# trusted for every repository on the machine.
cat > "$SOURCE" <<EOF
Types: deb
URIs: https://ryjord.github.io/Copacetic/apt
Suites: stable
Components: main
Architectures: amd64 arm64
Signed-By: $KEYRING
EOF

chmod 0644 "$SOURCE"
exit 0
