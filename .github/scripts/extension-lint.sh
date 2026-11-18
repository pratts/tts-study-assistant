#!/usr/bin/env bash
# Lints an unzipped extension package with Mozilla's web-ext (the linter
# addons.mozilla.org runs on upload) and compares the result with the
# allowlist. Used by Extension CI and the release workflow, so both lint the
# same way with the same pinned version.
#
#   .github/scripts/extension-lint.sh <unzipped-package-dir> <report-dir>
#
# Writes <report-dir>/lint.json (the raw report) and <report-dir>/lint.txt
# (the check's output) and exits non-zero on errors or unexpected warnings.
set -euo pipefail

# Pinned for reproducible results. To update: bump this, run Extension CI, and
# adjust extension-lint-allowlist.json for new or removed warnings
# (https://github.com/mozilla/web-ext/releases).
WEB_EXT_VERSION="${WEB_EXT_VERSION:-10.8.0}"

package="$1"
reports="$2"
scripts="$(dirname "$0")"
mkdir -p "$reports"

echo "web-ext ${WEB_EXT_VERSION}" > "$reports/lint.txt"
# web-ext exits non-zero on lint errors; the check below reports them.
npx --yes "web-ext@${WEB_EXT_VERSION}" lint --source-dir "$package" --output json > "$reports/lint.json" || true
# pipefail (set above): the check's exit code, not tee's.
node "$scripts/extension-checks.mjs" lint "$reports/lint.json" "$scripts/extension-lint-allowlist.json" | tee -a "$reports/lint.txt"
