#!/bin/bash
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_ACTOR:?GITHUB_ACTOR is required}"
manifest_directory=${1:?Manifest directory is required}
header_file=$(mktemp)
trap 'rm -f "$header_file"' EXIT

for manifest in "$manifest_directory"/*.json; do
  image=$(jq -er '.image' "$manifest")
  digest=$(jq -er '.digest' "$manifest")
  package_path=${image#ghcr.io/}
  registry_token=$(curl -fsS --user "$GITHUB_ACTOR:$GH_TOKEN" --get \
    --data-urlencode 'service=ghcr.io' --data-urlencode "scope=repository:$package_path:pull" \
    https://ghcr.io/token | jq -er '.token')
  status=$(curl -sS -o /dev/null -D "$header_file" -w '%{http_code}' \
    -H "Authorization: Bearer $registry_token" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json' \
    -I "https://ghcr.io/v2/$package_path/manifests/$RELEASE_TAG")
  if [ "$status" = 200 ]; then
    existing_digest=$(awk 'tolower($1) == "docker-content-digest:" { sub("\r$", "", $2); print $2; exit }' "$header_file")
    [ "$existing_digest" = "$digest" ] || {
      echo "Refusing to replace the released image $image:$RELEASE_TAG" >&2
      exit 1
    }
  elif [ "$status" = 404 ]; then
    docker buildx imagetools create --tag "$image:$RELEASE_TAG" "$image@$digest"
  else
    echo "GHCR version lookup failed with HTTP $status" >&2
    exit 1
  fi
  # Consume the complete output: closing the pipe early makes Buildx fail with SIGPIPE.
  promoted_digest=$(docker buildx imagetools inspect "$image:$RELEASE_TAG" | awk '$1 == "Digest:" && !printed { print $2; printed=1 }')
  [ "$promoted_digest" = "$digest" ]
done
