---
title: Hooks
description: Hooks start a Job you defined when something happens, such as a model registration, the end of a Run, a saved checkpoint, or an external webhook. Creating hooks, manual starts, webhook signatures, copies, and executions.
---

# Hooks

A hook starts a Job you defined when something happens in the Project (its trigger). Open it from **Hooks** under **Execution** in the left sidebar. [Automation after registration](/en/models/automation) starts only on model registration; hooks can also start on the end of a Run, a saved checkpoint, or an external webhook, and can run on sites.

A hook starts Jobs with its owner's permissions, and the owner becomes the creator of the Runs. The owner is initially the person who created the hook.

## When to use it

- Evaluate with a training Run's model and output data when the Run ends
- Evaluate every checkpoint saved during training
- Start a Job from outside, for example on a GitHub push or a data update
- Start a Job with fixed settings by hand, changing only a JSON body

## Triggers {#triggers}

| **Trigger** | Starts when | Passed to the Job |
| --- | --- | --- |
| **Manual / Launch API** | Started with **Launch manually** in the hook's details, or from the API or the Python SDK | The body given at the start (JSON) |
| **Model version registered** | A model version is registered. A version registered during training waits for the training Run to end | The registered model version |
| **Run ended** | A Run ends, including failures and cancellations (filter with **Run end status**) | Optionally, the Run's model version and output dataset versions |
| **Array ended** | The last attempt of every index of an array has ended | Optionally, the output dataset versions of every index |
| **Checkpoint saved** | A training Run saves a checkpoint with the SDK | That checkpoint (`MMT_INPUT_CHECKPOINT_DIR` in the Job, usually `/mmt/inputs/checkpoint`) |
| **External webhook** | A POST with a valid signature arrives | The body that was sent |

- Checkpoints placed under MLflow's `checkpoints/step-N/` do not start hooks, because there is no point at which the files are known to be complete. Use the SDK's `run.log_checkpoint()` ([Resume training](/en/models/checkpoints)).
- A model version registered during training starts the hook when the training Run succeeds. It does not start when the Run fails or is canceled, or when the Run has not ended after 7 days.
- One event starts a hook only once. Resent webhooks and Runs that are reopened and end again do not add Jobs.

Inside the Job, the trigger is readable as `/mmt/context/trigger-payload.json` (environment variable `MMT_TRIGGER_PAYLOAD_FILE`): the body of a manual start, the body of a webhook (`{"body": "<body>"}` when it is not a JSON object), or a description of the event such as `{"event": "run_finished", "runId": …}` for other triggers.

## Create a hook {#create-a-hook}

Editors and above can create hooks.

1. Open **Hooks** and press **Create hook** at the top right.
2. Fill in the fields below and press **Create**.
3. Select the new hook and check its settings in the details.

The code version, computer, runtime, GPUs, and inputs are checked at creation as they would be at a start, so a hook that could never start cannot be created.

### Trigger

| Field | Contents |
| --- | --- |
| **Name** | The hook's name, for example `evaluate after training` |
| **Trigger** | One of the [triggers above](#triggers) |
| **Signature format** | For external webhooks: GitHub (X-Hub-Signature-256) or MMT (X-MMT-Signature) ([Start from a webhook](#start-from-a-webhook)) |
| **Checkpoint launches** | For saved checkpoints. See below |
| **Launch every N checkpoints** | When starting every N checkpoints. 1 to 100,000 |

| **Checkpoint launches** | Behavior |
| --- | --- |
| **Every checkpoint** | Starts on every save (default) |
| **Every N checkpoints** | Starts on every N-th checkpoint of the Run |
| **Latest only (coalesce new checkpoints during evaluation)** | Checkpoints that arrive while an evaluation Job runs wait as one, the newest, which starts when the previous evaluation ends |
| **Skip while running** | Checkpoints that arrive while an evaluation Job runs start nothing |

### Trigger filter

Every trigger except manual and external webhook can be filtered. Empty fields do not filter. Events that do not match start nothing and leave no execution record.

| Field | Contents |
| --- | --- |
| **Model family** | Target model families |
| **Experiment** | Target Experiments |
| **Run kind** | Training, inference, and so on |
| **Run end status** | Finished, failed, canceled. Only for Run ended and array ended (the training Run has not ended yet at a model registration or a checkpoint save) |
| **Run tags (JSON; all must match)** | For example `{"dataset": "speech-v3"}`. Starts only for Runs where every tag matches |

### Job to start

| Field | Contents |
| --- | --- |
| **Experiments** | The Experiment that records the Runs |
| **Run kind** | Training, fine-tuning, inference, evaluation, data processing |
| **Model version** | A fixed version, or **Use the triggering run's model version** for Run ended, array ended, and checkpoint saved. Model registration has no such field and starts with the registered version |
| **Code version** | Only code versions that support the run kind and model families |
| **Input dataset versions** | Dataset versions passed every time. Optional |
| **Also use the triggering run's output dataset versions as inputs** | For Run ended and array ended |
| **Computer** | Only computers that can use the code version's runtime |
| **GPUs (CPU only if none selected)** | Appears once an SSH or Local computer is chosen. Check GPUs registered on the computer; without a GPU the Job runs on CPU only. A computer without GPUs shows `This computer has no GPU. Execution will use the CPU only.` |
| **GPU count**, **Time limit (HH:MM:SS, optional)**, **Array size (optional; blank creates a single job)**, **Dataset version to split across the array (optional; version with files)** | For sites. With an array size, each start creates an array |
| **Parameters (JSON)**, **Tags (JSON)** | Tags starting with `automation.` or `mmt.` are reserved for the server |
| **Maximum attempts** | 1 to 100, default 1. The limit of automatic retries; retries by people with **Rerun as a new run** in **Jobs** do not count |
| **Restart from scratch on failure**, **Retry from the latest checkpoint on timeout** | For sites. Hook Jobs are retried automatically only when these are checked |
| **Allow this job's code to create child jobs (driver)** | Lets the Job's code create child Jobs with its Job token |

**Resources per job** in the hook's details sums up the GPU IDs for SSH and Local, or the GPU count, time limit, and array size for sites.

When you choose a manual-submission site, the form says that Jobs created by the hook wait until the owner runs `mado-tracking submit` on the site's login node. The computer in the list and the details is marked **Manual submission**. See [External computers (sites)](/en/compute/sites) for submitting.

### Start limits

| Field | Contents |
| --- | --- |
| **Events before the previous job finishes** | **Launch all** (default) or **Skip events while a previous job is running**. With the latter, events that arrive while a Job of this hook is running start nothing, now or later |
| **Maximum launches per hour** | 1 to 10,000, default 60. While the starts in the last hour are at the limit, events start nothing |

## Start manually {#start-manually}

Hooks with the manual trigger can be started from **Launch manually** in their details. Editors and above can start them, only while the hook is enabled.

1. Optionally write a JSON object in **Payload (JSON, optional)**, up to 256 KiB.
2. Press **Launch manually** and then **Launch** in the confirmation.
3. When `Launch accepted (Job created).` appears, follow the result in **Execution history** or in **Jobs**.

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

1. In **Create hook**, choose **External webhook** as the trigger, choose **Signature format**, and create the hook.
2. **Webhook settings** opens right away with **Signing secret** and **Webhook URL**, each with a copy button.
3. Set the URL and secret in the sender, then press **Close**.

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

- Switch with **Disable** and **Enable** in the **Actions** column of the list (editors and above). A disabled hook starts nothing on later events, and executions that were waiting do not start either.
- To change settings, press **Copy as new hook** in the hook's details. A create form with the current settings opens (**Create a copy of the hook**, named `<original name> (copy)`). Change what you need and press **Create**. The original hook stays; disable it if you no longer need it.
- A copy of an external webhook hook gets a new receiving URL and secret. Change the sender's settings too.
- Hooks cannot be deleted yet. Disabled hooks stay in the list as **Disabled**.

## Move hook ownership to a Service Account {#move-hook-ownership}

When the person who created a hook stops being an editor of the Project, the hook is skipped with **Owner lost project permissions** and starts no Jobs. For long-lived hooks, move ownership to a Service Account that is not tied to a person.

1. In **Project settings**, create a Service Account with the editor or admin role. No token is needed ([API tokens and Service Accounts](/en/admin/tokens)).
2. In **Transfer to service account** in the hook's details, choose **Destination service account**, press **Transfer to service account**, and confirm.
3. Check that **Owner** in the list and the details shows the Service Account.

Project admins and global administrators can move ownership, only to an enabled Service Account of the same Project with the editor or admin role. Later starts run with the Service Account's permissions, and it becomes the creator of the Runs. The record of who created the hook (**Created by**) stays, and the move is in the audit log.

If the hook runs on a Private computer, move ownership to a Service Account created by that computer's owner. A Service Account created by someone else cannot use the computer, so starts fail ([Computers and visibility](/en/compute/computers#visibility)).

## View executions {#executions}

The **Execution history** tab (also opened with **View execution history** in the hook's details) lists each start, newest first. **Hook to display** narrows it to one hook. **Load more** loads older records.

| Column | Contents |
| --- | --- |
| **Created at** | When the event was received |
| **Hooks** | Which hook, when all hooks are shown |
| **Outcome** | See below |
| **Event** | The event: manual, model version, Run, array, checkpoint, or webhook. Model versions, Runs, and arrays link to their pages |
| **Job status** | Status of the created Job |
| **Related** | **Open run**, **Open job**, **array**, **Waiting for run** |
| **Job error** | Why a start failed |

| Outcome | Meaning |
| --- | --- |
| **Job created** | A Job, or the Jobs of an array, was created |
| **Waiting for run to finish** | For a version registered during training, waiting for the training Run to end. Also shown when **Latest only (coalesce new checkpoints during evaluation)** waits for the previous evaluation to end |
| **Not launched** with a reason | Not started because of a condition. Reasons below |
| **Launch failed** | The Job or Run could not be created. The reason is in **Job error**. The event itself is not undone |

| Reason for skipping | Meaning |
| --- | --- |
| **This hook already ran in the same chain** | The end of a Job this hook started would start the same hook again. A hook never keeps starting itself |
| **Chain depth exceeds the limit (10 stages)** | The chain of hooks and drivers is deeper than 10 links |
| **Maximum launches per hour** | The starts in the last hour reached the limit |
| **Previous job has not finished** | With **Skip events while a previous job is running** or **Skip while running**, a Job of this hook is still running |
| **Owner lost project permissions** | The owner is no longer an editor of the Project |
| **Replaced by a newer checkpoint** | With **Latest only (coalesce new checkpoints during evaluation)**, a newer checkpoint arrived |
| **Triggering run failed or stopped** | The training Run of a version registered during training did not succeed |
| **Run completion deadline exceeded** | The training Run had not ended after 7 days |
| **Hook disabled** | The hook was disabled while waiting |

## Retry failed Jobs

Hook Jobs have maximum attempts 1 (no automatic retry) by default. People can rerun a failed Job with **Rerun as a new run** in **Jobs**, even after it reached its maximum attempts. The Job's creator (the hook's owner) and Project admins can do so. The retried Job also shows the hook as its origin. See [The Jobs page](/en/compute/jobs#stop-and-retry).

## Permissions

| Action | Required role |
| --- | --- |
| View hooks and executions | viewer or higher |
| Create hooks, enable and disable them, start them manually | editor or higher (`jobs:write` for API tokens) |
| Move ownership | Project admin or global administrator (`admin` scope for API tokens) |
| Send to the receiving URL | A sender that holds the signing secret (no sign-in needed) |
