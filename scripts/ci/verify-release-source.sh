#!/bin/sh
set -eu

: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_REPOSITORY:?RELEASE_REPOSITORY is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

[ "$(git cat-file -t "$RELEASE_TAG")" = tag ] || {
  echo 'Release tags must be annotated' >&2
  exit 1
}
release_sha=$(git rev-parse "$RELEASE_TAG^{commit}")
git fetch --no-tags origin main
git merge-base --is-ancestor "$release_sha" origin/main || {
  echo 'Release commit is not part of main' >&2
  exit 1
}
"$(dirname "$0")/main-ci-succeeded.sh" "$RELEASE_REPOSITORY" "$release_sha" || {
  echo 'The release commit has not passed CI on main' >&2
  exit 1
}
printf '%s\n' "$release_sha"
