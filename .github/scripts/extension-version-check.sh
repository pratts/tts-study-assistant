#!/usr/bin/env bash
# Fails unless the extension's version is higher than every version it must
# beat: main's manifest.json and the latest extension-v* release tag. The
# Chrome Web Store only accepts uploads with a higher version than the
# published one, so every shipped change needs a bump.
#
#   .github/scripts/extension-version-check.sh <new-version> <base-version> [latest-release-version]
set -euo pipefail

new="$1"
base="$2"
released="${3:-}"

# Chrome: 1-4 dot-separated integers, each 0-65535, no leading zeros.
valid() {
  [[ "$1" =~ ^(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){0,3}$ ]] || return 1
  local IFS=. part
  for part in $1; do ((part <= 65535)) || return 1; done
}

# True when $1 > $2 as dotted integers (1.10 > 1.9; 1.0 == 1.0.0).
greater() {
  local IFS=.
  local -a a=($1) b=($2)
  for i in 0 1 2 3; do
    local x="${a[i]:-0}" y="${b[i]:-0}"
    ((10#$x > 10#$y)) && return 0
    ((10#$x < 10#$y)) && return 1
  done
  return 1
}

if ! valid "$new"; then
  echo "::error file=extension/manifest.json::Invalid version \"$new\": use 1-4 dot-separated integers (0-65535, no leading zeros), e.g. 0.2.1"
  exit 1
fi

failed=0
if ! greater "$new" "$base"; then
  echo "::error file=extension/manifest.json::Version $new must be higher than main's $base. Bump \"version\" in extension/manifest.json (patch for fixes, minor for features)."
  failed=1
fi
if [[ -n "$released" ]] && ! greater "$new" "$released"; then
  echo "::error file=extension/manifest.json::Version $new must be higher than the latest release $released."
  failed=1
fi
((failed)) && exit 1
echo "Version $new is higher than main ($base)${released:+ and the latest release ($released)}."
