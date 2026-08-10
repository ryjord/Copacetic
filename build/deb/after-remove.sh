#!/bin/sh
# Takes the apt source and its key back out again.
#
# Only on `purge`, not on a plain `remove`: an upgrade runs remove then install,
# and tearing down the source in between would leave apt unable to find the very
# package it is upgrading to.
set -e

if [ "$1" != "purge" ]; then
  exit 0
fi

rm -f /etc/apt/sources.list.d/copacetic.sources
rm -f /usr/share/keyrings/copacetic-archive-keyring.gpg
exit 0
