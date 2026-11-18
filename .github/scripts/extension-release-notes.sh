#!/usr/bin/env bash
# Writes release notes for an extension-v* tag: the commits that changed
# extension/ since the previous extension-v* tag (by version), or all of them
# for the first release. Run from the repository root with full history and
# tags.
#
#   .github/scripts/extension-release-notes.sh <tag> <notes-file>
set -euo pipefail

tag="$1"
notes_file="$2"
version="${tag#extension-v}"

# The tag sorted just before this one, by version (not by date).
previous="$(git tag -l 'extension-v*' --sort=v:refname | awk -v t="${tag}" '$0 == t { print prev; exit } { prev = $0 }')"
range="${previous:+${previous}..}${tag}"

{
  echo "Extension **v${version}** for Chrome and Firefox. The attached \`tts-study-assistant-extension-v${version}.zip\` is the package for both stores: upload it to the Chrome Web Store and to addons.mozilla.org."
  echo
  echo "- **Chrome:** unzip and load the folder at \`chrome://extensions\` (Developer mode → Load unpacked)."
  echo "- **Firefox:** \`about:debugging#/runtime/this-firefox\` → Load Temporary Add-on → pick the zip. A \`tts-study-assistant-firefox-v${version}.xpi\`, when attached, is the version signed by addons.mozilla.org."
  echo
  echo "### Changes in \`extension/\`"
  echo
  changes="$(git log --no-merges --format='- %s (%h)' "${range}" -- extension/)"
  echo "${changes:-- No extension changes since the previous release.}"
  if [[ -n "${previous}" ]]; then
    echo
    echo "Previous release: \`${previous}\`"
  fi
} > "${notes_file}"

echo "previous=${previous}"
