#!/usr/bin/env bash
# Decides whether the extension release workflow publishes a release for the
# current commit, and writes the release notes. Run from the repository root
# with full history and tags.
#
#   .github/scripts/extension-release-plan.sh <version> <notes-file>
#
# Prints key=value lines (for $GITHUB_OUTPUT):
#   tag=extension-v<version>
#   action=create  no release for this version yet
#   action=skip    a release for this version already exists (the version
#                  was not bumped; the PR version check should prevent this)
#   previous=<previous extension-v* tag, if any>
set -euo pipefail

version="$1"
notes_file="$2"
tag="extension-v${version}"
head="$(git rev-parse HEAD)"

if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  action=skip
else
  action=create
fi

# Notes cover the extension changes since the previous release (every
# extension change ever, for the first release).
previous="$(git tag -l 'extension-v*' --sort=-v:refname | grep -vx "${tag}" | head -n 1 || true)"
range="${previous:+${previous}..}${head}"

{
  echo "Chrome extension **v${version}**: install by unzipping the attached file and loading it at \`chrome://extensions\` (Developer mode → Load unpacked), or upload the zip to the Chrome Web Store."
  echo
  echo "### Changes in \`extension/\`"
  echo
  changes="$(git log --no-merges --format='- %s (%h)' "${range}" -- extension/)"
  echo "${changes:-- No extension changes found.}"
  if [[ -n "${previous}" ]]; then
    echo
    echo "Previous release: \`${previous}\`"
  fi
} > "${notes_file}"

echo "tag=${tag}"
echo "action=${action}"
echo "previous=${previous}"
