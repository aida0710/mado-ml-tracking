#!/bin/sh
# mainのcommitでCIのworkflowが通っていれば成功する（mainへのpushか、mainでの手動実行）。
# 使い方: main-ci-succeeded.sh <owner/repository> <commit SHA>。tokenを設定したghが要る。
set -eu

repository=${1:?repository is required}
commit=${2:?commit is required}
gh api --paginate \
  "repos/$repository/actions/workflows/ci.yml/runs?head_sha=$commit&per_page=100" \
  | jq -s -e --arg sha "$commit" '
    any(.[].workflow_runs[];
      .head_sha == $sha and .head_branch == "main" and
      (.event == "push" or .event == "workflow_dispatch") and
      .status == "completed" and .conclusion == "success")
  ' >/dev/null
