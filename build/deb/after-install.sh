#!/bin/sh
# Registers Copacetic's apt repository, when there is one to register.
#
# Both files below are written by the release workflow, and only when an apt
# repository is actually configured for it to point at. A build without them —
# a local `npm run package`, a fork, or a release made while no repository is
# hosted — installs without touching apt at all. That matters: a source that
# 404s makes `apt update` fail on every run, which is worse for the user than
# having no source in the first place.
set -e

RESOURCES=/opt/Copacetic/resources
SHIPPED_KEY="$RESOURCES/copacetic-archive-keyring.gpg"
SHIPPED_URL="$RESOURCES/copacetic-apt-source"

if [ ! -f "$SHIPPED_KEY" ] || [ ! -s "$SHIPPED_URL" ]; then
  exit 0
fi

REPO_URL="$(cat "$SHIPPED_URL")"
KEYRING_DIR=/usr/share/keyrings
KEYRING="$KEYRING_DIR/copacetic-archive-keyring.gpg"
SOURCE=/etc/apt/sources.list.d/copacetic.sources

mkdir -p "$KEYRING_DIR"
install -m 0644 "$SHIPPED_KEY" "$KEYRING"

# deb822 format, so the signing key is bound to this one source rather than
# trusted for every repository on the machine.
cat > "$SOURCE" <<EOF
Types: deb
URIs: $REPO_URL
Suites: stable
Components: main
Architectures: amd64 arm64
Signed-By: $KEYRING
EOF

chmod 0644 "$SOURCE"
exit 0
