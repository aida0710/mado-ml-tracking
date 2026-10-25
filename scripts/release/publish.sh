#!/bin/sh
# Creates and pushes the annotated release tag once the release source is ready, which starts the
# release workflow (.github/workflows/release.yml). See docs/releasing.md.
# Usage: publish.sh [--verify-only] <tag> [<one-line summary for the tag message>]
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
repository=aida0710/mado-ml-tracking
verify_only=false
if [ "${1:-}" = --verify-only ]; then
  verify_only=true
  shift
fi
tag=${1:-}
summary=${2:-}

node "$root/scripts/release/version.mjs" "$tag"

[ "$(git -C "$root" rev-parse --abbrev-ref HEAD)" = main ] || {
  echo "Error: releases must be prepared from main" >&2; exit 1;
}
[ -z "$(git -C "$root" status --porcelain --untracked-files=all)" ] || {
  echo "Error: working tree is not clean" >&2; exit 1;
}

git -C "$root" fetch origin main --tags
head_sha=$(git -C "$root" rev-parse HEAD)
[ "$head_sha" = "$(git -C "$root" rev-parse refs/remotes/origin/main)" ] || {
  echo "Error: HEAD is not the exact origin/main commit" >&2; exit 1;
}
"$root/scripts/ci/main-ci-succeeded.sh" "$repository" "$head_sha" || {
  echo "Error: HEAD has no successful main CI run" >&2; exit 1;
}
if git -C "$root" show-ref --verify --quiet "refs/tags/$tag" \
   || git -C "$root" ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Error: tag already exists and will not be moved: $tag" >&2
  exit 1
fi

echo "release source verified: $tag at $head_sha"
$verify_only && exit 0

printf 'Type %s to create and push the release tag: ' "$tag"
IFS= read -r confirmation
[ "$confirmation" = "$tag" ] || { echo "Cancelled." >&2; exit 1; }

message="mado ML Tracking $tag${summary:+: $summary}"
git -C "$root" tag -a "$tag" "$head_sha" -m "$message"
git -C "$root" push origin "refs/tags/$tag"
echo "release workflow triggered for $tag"
