---
title: The Jobs page
description: The list of Jobs started in a Project and the three steps of launching one. Why a queued Job does not start, reading logs, and stopping, retrying, or resuming from a checkpoint.
---

# The Jobs page

**Jobs** lists the Jobs (single executions of training, inference, evaluation, and so on) started in the Project, newest first. Open it from **Jobs** under 実行 (Execution) in the left sidebar. Besides launching Jobs, you can check why a queued Job does not start, read logs, and stop or retry Jobs. The page refreshes every 5 seconds.

Each Job has one Run. What the Job produced (metrics, Artifacts, exit status) stays in the Run.

## When to use it

- A training you launched stays queued and you want to know why
- Read the log of a failed Job to find the cause
- Stop a running Job, or run a failed Job again with the same settings

## Reading the list {#job-list}

| Column | Contents |
| --- | --- |
| Job | The first 8 characters of the Job ID. Press it to open the details below the list |
| **状態** (Status) | 待機中 (Queued), 割当済み (Claimed), 実行中 (Running), 完了 (Finished), 失敗 (Failed), 中止 (Canceled). A site Job also shows its phase (手動投入待ち, waiting for manual submission; 投入中, submitting; 待ち行列, in the scheduler queue; 準備・GPU待ち, preparing or waiting for GPUs) or why it ended (時間切れ, timed out; 待ち行列の上限, queue limit; 投入失敗, submission failed). A Job without a heartbeat for 60 seconds or more gets **応答なし** (Not responding), and a Job asked to stop gets **停止要求済み** (Stop requested) |
| Run | Run name and run kind. Press it to open the Run. Runs resumed from a checkpoint get **再開** (Resumed) |
| **作成者** (Creator) | The person who created the Job's Run. For Jobs of automation rules and hooks, the rule's or hook's owner |
| Task | The Task the Job was launched from |
| **コンピュータ** (Computer) | The computer that runs the Job |
| GPU ID | GPU IDs the Job uses. Site Jobs show a count such as `GPU ×2`; Jobs without GPUs show **CPUのみ** (CPU only) |
| **実行場所** (Where) | For site Jobs, the runner's host and the scheduler's job ID |
| **起動元** (Origin) | What started the Job when a person did not start it directly (table below) |
| **試行** (Attempt) | "Attempt / maximum attempts". A Job a person retried past its maximum shows, for example, `4（自動の再試行は3回目まで）` (4; automatic retries up to attempt 3) |
| **作成日時** (Created) | When the Job was created |
| **操作** (Actions) | **停止を要求** (Request stop), **新しいRunで再実行** (Retry in a new Run), **最新checkpointから再開** (Resume from latest checkpoint) ([Stop and retry](#stop-and-retry)) |

**状態** (Status) above the list filters by status, such as queued or failed.

The origin column shows:

| Example | Origin | Pressing it |
| --- | --- | --- |
| `Sweep: lr-search #3` | A Sweep trial (Sweep name and trial number) | Opens the Sweep |
| `自動実行: 登録時に推論` | An automation rule (rule name) | — |
| `フック: 学習後の評価` | A [hook](/en/compute/hooks) | Opens the hook |
| `親Job: 1a2b3c4d` | A child Job created by the code of a driver Job | Opens the parent Job's details |
| `array 3 / 10` | One member of a Job array (index / size) | Lists only the Jobs of that array |

When a person retries a Sweep or automation Job with **新しいRunで再実行**, the new Job shows no Sweep or automation origin. The hook, parent Job, and array carry over to retries.

### Job arrays

When a hook, a driver, or the Python SDK's `create_job_array` starts an array on a site (a group of the same Job that differ only in their index), a **Job array** table appears above the list. It shows, per array, the states counted from the latest attempt of each index, the size, the computer, and the origin. Only Jobs loaded in the list are counted. **Jobを表示** (Show Jobs) lists only that array's Jobs, and **すべてのJobを表示** (Show all Jobs) goes back.

## Launch a Job {#launch}

**ジョブを起動** (Launch job) at the top right opens a dialog in three steps: **実行内容** (What to run), **実行先** (Where to run), and **確認** (Review). Move with **次へ** (Next) and **戻る** (Back). Editors and above can launch Jobs.

### 1. What to run

| Field | Contents |
| --- | --- |
| **Run名** (Run name) | Name of the Run to create |
| Experiments | The Experiment that records the Run |
| **実行種別** (Run kind) | Training, fine-tuning, inference, evaluation, data processing |
| **モデルバージョン** (Model version) | The input model version. Optional |
| **コードバージョン** (Code version) | The code to run |
| **入力データセットバージョン** (Input dataset versions) | Dataset versions the worker fetches before running. Optional |
| Parameters, tags, Environment | JSON |

**コードバージョン** offers only code versions that support the chosen run kind and model version. When some do not, the count appears below the field, for example `実行種別「推論」とモデルバージョンに合うコードバージョンだけを選べます（合わないもの 2件）。` (Only code versions for the run kind "inference" and the model version can be chosen; 2 do not match). If the code you want is missing, change the run kind first. When none match, a link to **コードを登録** (Register code) appears.

A choice that stops matching after you change another field is cleared, and the dialog says what was cleared.

| You changed | Cleared | Message |
| --- | --- | --- |
| Run kind, model version | Code version | The code version does not match the run kind or model version; choose again |
| Code version | Computer (and its GPUs) | The computer cannot use this code version's runtime; choose again |
| Computer | GPUs | The GPUs were cleared because the computer changed |

### 2. Where to run

| Field | Contents |
| --- | --- |
| **コンピュータ** (Computer) | The computer to run on. Only computers you can use that support the code version's runtime are offered |
| **GPU（選ばなければCPUのみ）** (GPUs, CPU only if none) | Check GPUs registered on the computer. Without a GPU the Job runs on CPU only |
| **最大試行回数** (Maximum attempts) | 1 to 100, default 3. The limit of automatic retries; retries by people with **新しいRunで再実行** do not count |
| **このJobのコードから子Jobを作れる（ドライバー）** (Let this Job's code create child Jobs, driver) | Lets the Job's code create child Jobs with its Job token |

For a site, **GPU数** (GPU count), **制限時間（HH:MM:SS・任意）** (Time limit, optional), **失敗したら最初から再実行する** (Retry from the start on failure), and **時間切れなら最新のcheckpointから再実行する** (Retry from the latest checkpoint on timeout) appear instead of GPU IDs. Automatic retries happen only when a site Job has one of these two checked, and for [automation rule retries](/en/models/automation#retry-failures-automatically).

Without a computer for the runtime, `このRuntimeに対応するコンピュータがありません。` (No computer supports this runtime) appears and you cannot continue.

A computer no worker takes is listed with `（workerなし）` (no worker) after its name, and one whose workers stopped answering with `（workerオフライン）` (worker offline). Choosing it shows a warning such as `「gpu-1」を担当するworkerがいません。このまま起動すると、Jobはworkerが動くまで待機中のままです。` (No worker takes gpu-1. If you launch now, the Job stays queued until a worker runs) and **workerの設定を開く** (Open worker settings). You can still launch, but the Job does not start until a worker runs ([When a queued Job does not start](#queued-job-does-not-start)). Sites need no worker, so they are never marked.

### 3. Review

The settings so far and the runtime details of the code version are listed. For a manual-submission site, the command that submits the Job also appears here ([External computers (sites)](/en/compute/sites)). Check them and press **ジョブを起動** (Launch job).

The new Job is added to the list and its details open. The Run and the Job are created together: if the Job cannot be created, for example because the computer does not take Jobs, no Run is kept either. Fix the cause and press **ジョブを起動** again.

### Launch from a Run

On the page of a Run with code, a button depends on whether the Run has a Job.

| Run | Button |
| --- | --- |
| Queued, without a Job | **ジョブを起動** (Launch job), for editors and above. Creates only the Job for that Run (the Run is not created again) |
| With a Job (also while running and after it ends) | **Jobを見る** (View Job). Opens the Job's details in Jobs |

## When a queued Job does not start {#queued-job-does-not-start}

Jobs on SSH and Local computers are picked up and run by a worker that takes that computer. A worker only takes Jobs of the Project its token was issued for, so a running worker of another Project does not start this Project's Jobs.

### Queued Jobs that cannot start

When a computer with queued Jobs has no worker, or its workers stopped answering, **始まらない待機中のJob** (Queued Jobs that cannot start) appears above the list with:

- The count per computer, for example `gpu-1: 待機中 3件` (gpu-1: 3 queued)
- The worker state: **workerなし** (no worker), or **workerオフライン** (worker offline) with the time of the last answer
- **workerの設定を開く** (Open worker settings), which opens the computer's details

The computer's owner runs the worker (a global administrator when it has no owner). The owner and global administrators see example commands under **workerの設定** (Worker settings) in the computer's details. See [Install and run the worker](/en/compute/worker).

### The reason in the Job's details

The details of a queued Job show why it has not started above the fields.

| Message | Meaning | What to do |
| --- | --- | --- |
| `「gpu-1」を担当するworkerがいません。` (No worker takes gpu-1) | No worker of this Project takes Jobs of this computer | Ask the computer's owner to run a worker |
| `「gpu-1」を担当するworkerが応答していません（最終応答 …）。` (The worker for gpu-1 is not answering; last answer …) | The worker for the computer has not answered for 2 minutes or more | Check `mado-tracking-worker status` and its log on the worker machine |
| `担当するworkerは応答していますが、このJobをまだ受け取っていません。` (The worker answers but has not taken this Job yet), followed by the possible reasons | The worker is running but skips the Job for one of these: the computer's concurrent Job limit is reached, another Job holds the chosen GPUs, the computer is disabled, the computer lacks the code's runtime, or the computer is Local and the API server does not allow the local executor | For the limit and GPUs, wait for earlier Jobs to end or launch again on other GPUs or another computer. Check a disabled computer and its runtimes in **全体設定** → **コンピュータ** (Global settings → Computers), and the local executor with `MMT_ALLOW_LOCAL_EXECUTOR` ([Environment variables](/en/reference/environment)) |

Site Jobs need no worker. The phase next to the status (waiting for manual submission, in the scheduler queue, and so on) tells where they wait. For a manual-submission site, **手動投入を待っているJob** (Jobs waiting for manual submission) and the submit command appear above the list ([External computers (sites)](/en/compute/sites)).

### Check on the Compute page

The computer list on the Compute page also has a **worker** column, so you can check before launching.

| Shown | Meaning |
| --- | --- |
| `workerオンライン 2` | Number of workers that answer |
| **workerオフライン** (worker offline) | Workers for the computer exist but stopped answering. The last answer is shown too |
| **workerなし** (no worker) | No worker takes this computer |
| **不要（site）** (not needed, site) | A site needs no worker |

Global administrators also see **worker（いずれかのProject）** (worker, any Project) in a computer's details under **全体設定** → **コンピュータ** (Global settings → Computers). It counts the workers of every Project, so an online worker there does not mean one takes this Project's Jobs. Check on the Compute page whether they start in this Project.

## Job details {#job-details}

Press a Job ID in the Job column to open its details below the list; the page scrolls there. The heading is the Run name. **詳細を閉じる** (Close details) closes them. The URL gets `?job=<Job ID>`, so sharing it opens the same Job's details.

From top to bottom, the details show:

1. Why a queued Job has not started ([When a queued Job does not start](#queued-job-does-not-start))
2. Fields: Job ID, status, GPU ID, Heartbeat, **終了コード** (Exit code), **ジョブエラー** (Job error). Site Jobs add the phase, time limit, scheduler job ID, submission time, runner host, job shell version, and automatic retries. Array index, parent Job, hook, and chain depth appear when they apply
3. The guide for Jobs waiting for manual submission (manual-submission sites)
4. The log
5. **実行snapshot** (Execution snapshot): the Task revision, code version, command, and so on at launch ([Tasks and code versions](/en/models/tasks))

To find why a Job failed, look at **ジョブエラー** and **終了コード** first, then read the log.

## Read the log {#logs}

The log refreshes every 5 seconds while the Job is queued or running. A finished Job's log is read once when it opens.

- The latest 2,000 lines are shown. When there are more, the total is shown, for example `最新の2,000行を表示しています（全12,345行）。` (Showing the latest 2,000 of 12,345 lines). **すべての行を読み込む** (Load all lines) shows every line. For a log over 10,000 lines the button is **最新の10,000行まで読み込む** (Load the latest 10,000 lines); read older lines in the download.
- After loading more lines the view no longer refreshes. For a running Job, **新しい行を読み込む** (Load new lines) reads again, and **自動で更新する表示に戻る** (Back to the refreshing view) returns to the latest 2,000 lines.
- The view opens at the newest line and follows new lines while you stay there. Scrolling up to read stops following. **最新へ** (Jump to latest) goes back to the newest line.
- Times are shown to the second.
- Lines that redraw themselves with `\r`, such as tqdm progress bars, show only what was written last. The downloaded file keeps them as recorded.

| Control | Contents |
| --- | --- |
| **レベル** (Level) | All levels, info, warning, error |
| **並び順** (Order) | Oldest first, newest first |
| Search | Shows only lines that contain the words, ignoring case. The number of matches is shown, for example `3行が一致` (3 lines match) |
| **ダウンロード** (Download) | Saves every line as `<Run name>.log`, one entry per line with the time, level, and message separated by tabs. The server sends a long log as it reads it, so the browser does not hold all of it |

The level and search filters apply to the lines loaded. To search older lines while only the latest 2,000 are loaded, press **すべての行を読み込む** first. **ダウンロード** always saves every line, whatever is filtered or loaded. Characters of the Run name that cannot be used in file names become `_`.

## Stop and retry {#stop-and-retry}

The buttons in the actions column stop or rerun a Job. Each opens a confirmation that names the Run, the creator, and the computer, and says what will happen.

| Button | Shown for | What it does |
| --- | --- | --- |
| **停止を要求** (Request stop) | Queued, claimed, running | A queued Job (and a site Job still being submitted or in the scheduler queue) has not started, so it is canceled at once. For a running Job, the process is asked to stop, and the Job stays running until the worker stops it. In both cases, child Jobs created by this Job are stopped too |
| **新しいRunで再実行** (Retry in a new Run) | Finished, failed, canceled | Creates a new Run and Job with the same settings, runs them, and opens the new Run. The original Run and Job are kept |
| **最新checkpointから再開** (Resume from latest checkpoint) | Failed or canceled Jobs with a checkpoint to resume from, except trials stopped early by a Sweep | Continues from the newest saved checkpoint as a new Run ([Resume training](/en/models/checkpoints)) |

Press **停止する** (Stop) or **再実行する** (Retry) in the confirmation. After a stop is requested, **停止を要求** is disabled and the status shows **停止要求済み** (Stop requested).

### About retries

- A retry starts from the beginning. The Run is named like `<original Run name> (retry 2)` and keeps the code version, execution mode, Task revision, parameters, computer, and GPUs.
- Maximum attempts limits automatic retries only. People can retry a Job that reached its maximum attempts, including hook Jobs (maximum attempts 1 by default) and automation rule Jobs. Past the limit, the attempt column shows `2（自動の再試行は1回目まで）` (2; automatic retries up to attempt 1).
- Retries traced back from the same Job are limited to attempt 100.
- One Job gets at most one retry (resuming from a checkpoint included). Pressing **新しいRunで再実行** again on a Job that was already retried opens the Run created before. To run it once more, retry from the row of the Job that the retry created.

### Who can stop and retry

Only the Job's creator (the creator of its Run) and Project admins can stop, retry, or resume a Job from a checkpoint. In other people's rows, the actions column shows `停止・再実行は作成者かProject adminだけができます` (Only the creator or a Project admin can stop or retry) instead of buttons. For automation rule and hook Jobs, the creator is the rule's or hook's owner; when the owner is a Service Account, a Project admin retries them.

## Permissions

| Action | Required role |
| --- | --- |
| View the Job list, details, and logs | viewer or higher |
| Launch a Job | editor or higher (`runs:write` and `jobs:write` for API tokens) |
| Stop, retry, resume from a checkpoint | The creator of the Job's Run (editor or higher) or a Project admin (`jobs:write` for API tokens) |
