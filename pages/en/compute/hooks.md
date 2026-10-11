---
title: Hooks
description: Hooks start a Job you defined when something happens, such as a model registration, the end of a Run, a saved checkpoint, or an external webhook. Creating hooks, manual starts, webhook signatures, copies, and executions.
---

# Hooks

A hook starts a Job you defined when something happens in the Project (its trigger). Open it from **Hooks** under 実行 (Execution) in the left sidebar. [Automation after registration](/en/models/automation) starts only on model registration; hooks can also start on the end of a Run, a saved checkpoint, or an external webhook, and can run on sites.

A hook starts Jobs with its owner's permissions, and the owner becomes the creator of the Runs. The owner is initially the person who created the hook.

## When to use it

- Evaluate with a training Run's model and output data when the Run ends
- Evaluate every checkpoint saved during training
- Start a Job from outside, for example on a GitHub push or a data update
- Start a Job with fixed settings by hand, changing only a JSON body

## Triggers {#triggers}

| **きっかけ** (Trigger) | Starts when | Passed to the Job |
| --- | --- | --- |
| **手動・起動API** (Manual or start API) | Started with **手動で起動** (Start manually) in the hook's details, or from the API or the Python SDK | The body given at the start (JSON) |
| **モデルバージョンの登録** (Model version registered) | A model version is registered. A version registered during training waits for the training Run to end | The registered model version |
| **Runの終了** (Run ended) | A Run ends, including failures and cancellations (filter with **Runの終了状態**) | Optionally, the Run's model version and output dataset versions |
| **arrayの終了** (Array ended) | The last attempt of every index of an array has ended | Optionally, the output dataset versions of every index |
| **checkpointの保存** (Checkpoint saved) | A training Run saves a checkpoint with the SDK | That checkpoint (`MMT_INPUT_CHECKPOINT_DIR` in the Job, usually `/mmt/inputs/checkpoint`) |
| **外部webhook** (External webhook) | A POST with a valid signature arrives | The body that was sent |

- Checkpoints placed under MLflow's `checkpoints/step-N/` do not start hooks, because there is no point at which the files are known to be complete. Use the SDK's `run.log_checkpoint()` ([Resume training](/en/models/checkpoints)).
- A model version registered during training starts the hook when the training Run succeeds. It does not start when the Run fails or is canceled, or when the Run has not ended after 7 days.
- One event starts a hook only once. Resent webhooks and Runs that are reopened and end again do not add Jobs.

Inside the Job, the trigger is readable as `/mmt/context/trigger-payload.json` (environment variable `MMT_TRIGGER_PAYLOAD_FILE`): the body of a manual start, the body of a webhook (`{"body": "<body>"}` when it is not a JSON object), or a description of the event such as `{"event": "run_finished", "runId": …}` for other triggers.

## Create a hook {#create-a-hook}

Editors and above can create hooks.

1. Open **Hooks** and press **フックを作成** (Create hook) at the top right.
2. Fill in the fields below and press **作成** (Create).
3. Select the new hook and check its settings in the details.

The code version, computer, runtime, GPUs, and inputs are checked at creation as they would be at a start, so a hook that could never start cannot be created.

### Trigger

| Field | Contents |
| --- | --- |
| **名前** (Name) | The hook's name, for example `evaluate after training` |
| **きっかけ** (Trigger) | One of the [triggers above](#triggers) |
| **署名の形式** (Signature format) | For external webhooks: GitHub (X-Hub-Signature-256) or MMT (X-MMT-Signature) ([Start from a webhook](#start-from-a-webhook)) |
| **checkpointごとの起動** (Start per checkpoint) | For saved checkpoints. See below |
| **何個ごとに起動するか** (Every how many) | When starting every k checkpoints. 1 to 100,000 |

| **checkpointごとの起動** | Behavior |
| --- | --- |
| **毎回** (Every time) | Starts on every save (default) |
| **k個ごと** (Every k) | Starts on every k-th checkpoint of the Run |
| **最新だけ** (Latest only) | Checkpoints that arrive while an evaluation Job runs wait as one, the newest, which starts when the previous evaluation ends |
| **実行中なら飛ばす** (Skip while running) | Checkpoints that arrive while an evaluation Job runs start nothing |

### Trigger filter

Every trigger except manual and external webhook can be filtered. Empty fields do not filter. Events that do not match start nothing and leave no execution record.

| Field | Contents |
| --- | --- |
| **モデル系列** (Model families) | Target model families |
| **実験** (Experiments) | Target Experiments |
| **Runの実行種別** (Run kinds) | Training, inference, and so on |
| **Runの終了状態** (Run end states) | Finished, failed, canceled. Only for Run ended and array ended (the training Run has not ended yet at a model registration or a checkpoint save) |
| **Runのタグ（JSON・すべて一致）** (Run tags, JSON, all must match) | For example `{"dataset": "speech-v3"}`. Starts only for Runs where every tag matches |

### Job to start

| Field | Contents |
| --- | --- |
| Experiments | The Experiment that records the Runs |
| **実行種別** (Run kind) | Training, fine-tuning, inference, evaluation, data processing |
| **モデルバージョン** (Model version) | A fixed version, or **きっかけのRunのモデルバージョンを使う** (Use the triggering Run's model version) for Run ended, array ended, and checkpoint saved. Model registration has no such field and starts with the registered version |
| **コードバージョン** (Code version) | Only code versions that support the run kind and model families |
| **入力データセットバージョン** (Input dataset versions) | Dataset versions passed every time. Optional |
| **きっかけのRunの出力データセットバージョンも入力にする** (Also use the triggering Run's output dataset versions) | For Run ended and array ended |
| **コンピュータ** (Computer) | Only computers that can use the code version's runtime |
| **GPU（選ばなければCPUのみ）** (GPUs, CPU only if none) | Appears once an SSH or Local computer is chosen. Check GPUs registered on the computer; without a GPU the Job runs on CPU only. A computer without GPUs shows `このコンピュータにはGPUがないため、CPUのみで実行します。` (This computer has no GPUs, so the Job runs on CPU only) |
| GPU count, time limit, array size, input dataset version to split across the array | For sites. With an array size, each start creates an array |
| **パラメータ（JSON）**, **タグ（JSON）** (Parameters, tags) | Tags starting with `automation.` or `mmt.` are reserved for the server |
| **最大試行回数** (Maximum attempts) | 1 to 100, default 1. The limit of automatic retries; retries by people with **新しいRunで再実行** (Retry in a new Run) in Jobs do not count |
| **失敗したら最初から再実行する**, **時間切れなら最新のcheckpointから再実行する** (Retry on failure, retry from the latest checkpoint on timeout) | For sites. Hook Jobs are retried automatically only when these are checked |
| **このJobのコードから子Jobを作れる（ドライバー）** (Let this Job's code create child Jobs, driver) | Lets the Job's code create child Jobs with its Job token |

**Jobごとの資源** (Resources per Job) in the hook's details sums up the GPU IDs for SSH and Local, or the GPU count, time limit, and array size for sites.

When you choose a manual-submission site, the form says that Jobs created by the hook wait until the owner runs `mado-tracking submit` on the site's login node. The computer in the list and the details is marked **手動投入** (Manual submission). See [External computers (sites)](/en/compute/sites) for submitting.

### Start limits

| Field | Contents |
| --- | --- |
| **前のJobが終わる前のイベント** (Events before the previous Job ends) | **すべて起動する** (Start all, default) or **前のJobが終わるまで起動しない** (Do not start until the previous Job ends). With the latter, events that arrive while a Job of this hook is running start nothing, now or later |
| **1時間あたりの起動回数の上限** (Maximum starts per hour) | 1 to 10,000, default 60. While the starts in the last hour are at the limit, events start nothing |

## Start manually {#start-manually}

Hooks with the manual trigger can be started from **手動で起動** (Start manually) in their details. Editors and above can start them, only while the hook is enabled.

1. Optionally write a JSON object in **本文（JSON・任意）** (Body, JSON, optional), up to 256 KiB.
2. Press **手動で起動** and then **起動する** (Start) in the confirmation.
3. When `起動を受け付けました（Jobを登録）。` (Start accepted; Job queued) appears, follow the result in **実行履歴** (Executions) or in Jobs.

Inside the Job, the body is readable as `/mmt/context/trigger-payload.json` (environment variable `MMT_TRIGGER_PAYLOAD_FILE`).

The Python SDK can start hooks too, with a person's API token. A Job token inside a Job cannot start hooks.

```python
from mado_tracking import Client

with Client() as client:
    client.trigger_hook("PROJECT_ID", "HOOK_ID", {"ref": "refs/heads/main"}, idempotency_key="deploy-42")
```

Resending with the same `idempotency_key` starts only once. Without one, the SDK adds it.

## Start from a webhook {#start-from-a-webhook}

### Before you start

The API server needs `MMT_HOOK_SECRET_KEY` (base64 of 32 bytes; `openssl rand -base64 32` makes one). Without it, hooks with the external webhook trigger cannot be created; ask the server administrator. Changing this key makes existing webhook hooks stop accepting deliveries, so recreate them and change the sender's secret.

### Create

1. In **フックを作成**, choose **外部webhook** (External webhook) as the trigger, choose **署名の形式** (Signature format), and create the hook.
2. **Webhookの設定** (Webhook settings) opens right away with **署名の秘密鍵** (Signing secret) and **受け口のURL** (Receiving URL), each with a copy button.
3. Set the URL and secret in the sender, then press **閉じる** (Close).

The secret is shown only once, on this screen; after closing it cannot be shown again. The receiving URL (`https://<this page's host>/api/hooks/<hook ID>/webhook`) stays in the hook's details with a copy button. If the API is published under a different name than this page, append the path to that host.

### Signature formats

| Format | Sender settings | Duplicate detection |
| --- | --- | --- |
| GitHub (X-Hub-Signature-256) | In the repository's Webhooks on GitHub, set Payload URL to the receiving URL, Content type to `application/json`, and Secret to the signing secret | Resends with the same `X-GitHub-Delivery` count once |
| MMT (X-MMT-Signature) | Send `X-MMT-Signature: t=<unix seconds>,v1=<hex of HMAC-SHA256(secret, "<t>.<body>")>`. Clock differences up to 5 minutes are accepted | Resends with the same `X-MMT-Delivery` count once |

Requests without the duplicate-detection header each count as a separate event. Senders in the LAN and CI can use the MMT format.

```bash
body='{"dataset":"speech-v3"}'
t=$(date +%s)
sig=$(printf '%s.%s' "$t" "$body" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -sS -X POST "https://tracking.example.internal/api/hooks/$HOOK_ID/webhook" \
  -H 'Content-Type: application/json' -H "X-MMT-Signature: t=$t,v1=$sig" \
  -H "X-MMT-Delivery: $(uuidgen)" -d "$body"
```

| Response | Meaning |
| --- | --- |
| 202 | Accepted. `executionId` is the execution record |
| 401 | The signature does not match |
| 409 | The hook is disabled |

Bodies are limited to 256 KiB. When exposing the receiving URL to the outside, let only `/api/hooks/*/webhook` through at the entry proxy.

## Change settings {#change-settings}

A hook's settings cannot be changed after creation; only enabling and disabling and the owner can change. This keeps the settings each past start used.

- Switch with **無効にする** (Disable) and **有効にする** (Enable) in the actions column of the list (editors and above). A disabled hook starts nothing on later events, and executions that were waiting do not start either.
- To change settings, press **複製して新しく作る** (Copy as a new hook) in the hook's details. A create form with the current settings opens (**フックを複製して作成**, Copy hook, named `<original name>（複製）`). Change what you need and press **作成** (Create). The original hook stays; disable it if you no longer need it.
- A copy of an external webhook hook gets a new receiving URL and secret. Change the sender's settings too.
- Hooks cannot be deleted yet. Disabled hooks stay in the list as **無効** (Disabled).

## Move hook ownership to a Service Account {#move-hook-ownership}

When the person who created a hook stops being an editor of the Project, the hook is skipped with `所有者がプロジェクトの権限を失っている` (the owner lost access to the Project) and starts no Jobs. For long-lived hooks, move ownership to a Service Account that is not tied to a person.

1. In the Project settings, create a Service Account with the editor or admin role. No token is needed ([API tokens and Service Accounts](/en/admin/tokens)).
2. In **Service Accountへ移す** (Move to Service Account) in the hook's details, choose **移管先のService Account** (Service Account), press **Service Accountへ移す**, and confirm.
3. Check that **所有者** (Owner) in the list and the details shows the Service Account.

Project admins and global administrators can move ownership, only to an enabled Service Account of the same Project with the editor or admin role. Later starts run with the Service Account's permissions, and it becomes the creator of the Runs. The record of who created the hook (**作成者**, Creator) stays, and the move is in the audit log.

If the hook runs on a Private computer, move ownership to a Service Account created by that computer's owner. A Service Account created by someone else cannot use the computer, so starts fail ([Computers and visibility](/en/compute/computers#visibility)).

## View executions {#executions}

The **実行履歴** (Executions) tab (also opened with **実行履歴を見る**, View executions, in the hook's details) lists each start, newest first. **表示するフック** (Hook to show) narrows it to one hook. **さらに読み込む** (Load more) loads older records.

| Column | Contents |
| --- | --- |
| **作成日時** (Created) | When the event was received |
| **フック** (Hook) | Which hook, when all hooks are shown |
| **結果** (Outcome) | See below |
| **対象** (Subject) | The event: manual, model version, Run, array, checkpoint, or webhook. Model versions, Runs, and arrays link to their pages |
| **Jobの状態** (Job status) | Status of the created Job |
| **関連** (Links) | **Runを開く** (Open Run), **Jobを開く** (Open Job), **array**, **待っているRun** (Run waited for) |
| **ジョブエラー** (Job error) | Why a start failed |

| Outcome | Meaning |
| --- | --- |
| **Jobを登録** (Job queued) | A Job, or the Jobs of an array, was created |
| **Runの終了待ち** (Waiting for the Run to end) | For a version registered during training, waiting for the training Run to end. Also shown when **最新だけ** waits for the previous evaluation to end |
| **起動せず** (Skipped) with a reason | Not started because of a condition. Reasons below |
| **起動に失敗** (Failed to start) | The Job or Run could not be created. The reason is in **ジョブエラー**. The event itself is not undone |

| Reason for skipping | Meaning |
| --- | --- |
| **同じ連鎖でこのフックが起動済み** (Already started in this chain) | The end of a Job this hook started would start the same hook again. A hook never keeps starting itself |
| **連鎖の深さが上限（10段）を超える** (Chain deeper than 10) | The chain of hooks and drivers is deeper than 10 links |
| **1時間あたりの起動回数の上限** (Maximum starts per hour) | The starts in the last hour reached the limit |
| **前のJobが終わっていない** (Previous Job not ended) | With **前のJobが終わるまで起動しない** or **実行中なら飛ばす**, a Job of this hook is still running |
| **所有者がプロジェクトの権限を失っている** (Owner lost access) | The owner is no longer an editor of the Project |
| **新しいcheckpointに置き換え** (Replaced by a newer checkpoint) | With **最新だけ**, a newer checkpoint arrived |
| **きっかけのRunが失敗・停止** (Triggering Run failed or stopped) | The training Run of a version registered during training did not succeed |
| **Runの終了待ちの期限切れ** (Wait for the Run expired) | The training Run had not ended after 7 days |
| **フックが無効** (Hook disabled) | The hook was disabled while waiting |

## Retry failed Jobs

Hook Jobs have maximum attempts 1 (no automatic retry) by default. People can rerun a failed Job with **新しいRunで再実行** (Retry in a new Run) in Jobs, even after it reached its maximum attempts. The Job's creator (the hook's owner) and Project admins can do so. The retried Job also shows the hook as its origin. See [The Jobs page](/en/compute/jobs#stop-and-retry).

## Permissions

| Action | Required role |
| --- | --- |
| View hooks and executions | viewer or higher |
| Create hooks, enable and disable them, start them manually | editor or higher (`jobs:write` for API tokens) |
| Move ownership | Project admin or global administrator (`admin` scope for API tokens) |
| Send to the receiving URL | A sender that holds the signing secret (no sign-in needed) |
