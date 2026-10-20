#!/bin/bash
# electron-builder's own after-install comes first, unchanged: the link in
# /usr/bin, the sandbox helper's permissions and the AppArmor profile that
# Ubuntu 24.04 needs before Chromium's sandbox can start at all. A custom script
# replaces that one rather than adding to it, and for 2.0's betas the .deb
# installed without any of them. The executable's name and folder are
# filled in by electron-builder when it builds the package.


if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Install apparmor profile. (Ubuntu 24+)
# First check if the version of AppArmor running on the device supports our profile.
# This is in order to keep backwards compatibility with Ubuntu 22.04 which does not support abi/4.0.
# In that case, we just skip installing the profile since the app runs fine without it on 22.04.
#
# Those apparmor_parser flags are akin to performing a dry run of loading a profile.
# https://wiki.debian.org/AppArmor/HowToUse#Dumping_profiles
#
# Unfortunately, at the moment AppArmor doesn't have a good story for backwards compatibility.
# https://askubuntu.com/questions/1517272/writing-a-backwards-compatible-apparmor-profile
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"

    # Updating the current AppArmor profile is not possible and probably not meaningful in a chroot'ed environment.
    # Use cases are for example environments where images for clients are maintained.
    # There, AppArmor might correctly be installed, but live updating makes no sense.
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      # Extra flags taken from dh_apparmor:
      # > By using '-W -T' we ensure that any abstraction updates are also pulled in.
      # https://wiki.debian.org/AppArmor/Contribute/FirstTimeProfileImport
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# Then Copacetic's apt repository, when there is one to register.
#
# Both files below are written by the release workflow, and only when an apt
# repository is actually configured for it to point at. A build without them -
# a local `npm run package`, a fork, or a release made while no repository is
# hosted - installs without touching apt at all. That matters: a source that
# 404s makes `apt update` fail on every run, which is worse for the user than
# having no source in the first place.
RESOURCES=/opt/Copacetic/resources
SHIPPED_KEY="$RESOURCES/copacetic-archive-keyring.gpg"
SHIPPED_URL="$RESOURCES/copacetic-apt-source"

if [ -f "$SHIPPED_KEY" ] && [ -s "$SHIPPED_URL" ]; then
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
fi
exit 0
