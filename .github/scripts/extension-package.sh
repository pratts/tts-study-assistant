#!/usr/bin/env bash
# Builds the extension zip that ships to the Chrome Web Store and
# addons.mozilla.org: runtime files only, manifest.json at the root.
# Used by Extension CI (to check and lint it) and Extension release, so both
# see exactly the same package.
#
#   .github/scripts/extension-package.sh <output.zip>
set -euo pipefail

out="$1"
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
rm -f "$out"

cd "$(dirname "$0")/../../extension"
# Info-ZIP reads the ZIP and ZIPOPT environment variables as extra options,
# which once turned the archive name into an input file (#34).
unset ZIP ZIPOPT
zip -q -r -X "$out" . \
  -x 'tests/*' 'package.json' 'package-lock.json' 'README.md' \
     'node_modules/*' '*.DS_Store' '.*' '*/.*'
echo "Built $out"
