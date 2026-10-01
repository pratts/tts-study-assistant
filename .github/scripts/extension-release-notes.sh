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
  echo "Chrome extension **v${version}**: install by unzipping the attached file and loading it at \`chrome://extensions\` (Developer mode → Load unpacked), or upload the zip to the Chrome Web Store."
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
