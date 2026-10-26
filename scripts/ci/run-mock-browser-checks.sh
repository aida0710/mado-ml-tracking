#!/bin/sh
# 模擬API（apps/web/tests/browserApi.mjs）で動くブラウザ検査を、Viteの開発サーバーを立てて順に流す。
# 開発用・確認用のAPIやDBは使わない。APIへのproxyは届かないport 9に向け、/api/はPlaywrightの
# routeが模擬APIで答える。1本でも失敗すれば、全部を流したあと失敗で終わる。
# 使い方: run-mock-browser-checks.sh <ログのディレクトリ>
#   MMT_PLAYWRIGHT_MODULE（Playwrightのindex.mjs）が要る。MMT_CHROMIUM_PATHは任意。
set -eu

logs=${1:?log directory is required}
: "${MMT_PLAYWRIGHT_MODULE:?MMT_PLAYWRIGHT_MODULE is required}"
# 開発用のWeb（5182）・検証用のサーバー（47000番台）と重ならないport。
port=${MMT_MOCK_WEB_PORT:-47310}
# Viteは1秒もかからず起動する。起動しないときに止まり続けないための上限。
vite_start_seconds=60
# 模擬APIだけで動く検査。実際のAPIやworkerを使う検査（開発モードのAPI、分離したAPI、
# local executor）はここに入れない。
checks='
accessibility
access
admin-storage
analysis
artifact-browser
artifacts
charts
computer-names
computer-setup
containers
copy-token-expiry
dialog-focus
first-run
i18n
lineage
media
model-automation
model-choices
model-pipeline
narrow-screens
navigation-history
permission-guards
plugin-connections
plugin-revisions
projects-admin
recording-connection
settings-guidance
settings-shell
site-computers
smoke
workbench
workflows
'

repository=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$logs"
(
  cd "$repository/apps/web"
  MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:9 exec "$repository/node_modules/.bin/vite" --port "$port" --strictPort --host 127.0.0.1
) > "$logs/vite.log" 2>&1 &
vite=$!
trap 'kill "$vite" 2>/dev/null || true' EXIT

waited=0
until curl -fs -o /dev/null "http://127.0.0.1:$port/"; do
  waited=$((waited + 1))
  if [ "$waited" -ge "$vite_start_seconds" ]; then
    echo "Vite did not start on port $port" >&2
    cat "$logs/vite.log" >&2
    exit 1
  fi
  sleep 1
done

export MMT_WEB_URL="http://127.0.0.1:$port"
failed=''
for check in $checks; do
  started=$(date +%s)
  if node "$repository/apps/web/tests/browser-$check.mjs" > "$logs/$check.log" 2>&1; then
    result=passed
  else
    result=FAILED
    failed="$failed $check"
  fi
  echo "$check: $result ($(($(date +%s) - started))s)"
done

if [ -n "$failed" ]; then
  echo "Failed browser checks:$failed" >&2
  for check in $failed; do
    echo "----- $check" >&2
    tail -n 40 "$logs/$check.log" >&2
  done
  exit 1
fi
