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
gh api --paginate \
  "repos/$RELEASE_REPOSITORY/actions/workflows/ci.yml/runs?head_sha=$release_sha&per_page=100" \
  | jq -s -e --arg sha "$release_sha" '
    any(.[].workflow_runs[];
      .head_sha == $sha and .head_branch == "main" and
      (.event == "push" or .event == "workflow_dispatch") and
      .status == "completed" and .conclusion == "success")
  ' >/dev/null || {
  echo 'The release commit has not passed CI on main' >&2
  exit 1
}
printf '%s\n' "$release_sha"
