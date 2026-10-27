---
title: The Jobs page
description: The list of Jobs started in a Project and the three steps of launching one. Why a queued Job does not start, reading logs, and stopping, retrying, or resuming from a checkpoint.
---

# The Jobs page

**Jobs** lists the Jobs (single executions of training, inference, evaluation, and so on) started in the Project, newest first. Open it from **Jobs** under **Execution** in the left sidebar. Besides launching Jobs, you can check why a queued Job does not start, read logs, and stop or retry Jobs. The page refreshes every 5 seconds.

Each Job has one Run. What the Job produced (metrics, Artifacts, exit status) stays in the Run.

## When to use it

- A training you launched stays queued and you want to know why
- Read the log of a failed Job to find the cause
- Stop a running Job, or run a failed Job again with the same settings

## Reading the list {#job-list}

| Column | Contents |
| --- | --- |
| **Job** | The first 8 characters of the Job ID. Press it to open the details below the list |
| **Status** | **Queued**, **Assigned**, **Running**, **Completed**, **Failed**, **Canceled**. A site Job also shows its phase (**Waiting for manual submission**, **Submitting**, **In scheduler queue**, **Preparing / Waiting for GPU**) or why it ended (**Timed out**, **Queue timeout**, **Submission failed**). A Job without a heartbeat for 60 seconds or more gets **No response**, and a Job asked to stop gets **Stop requested** |
| **Run** | Run name and run kind. Press it to open the Run. Runs resumed from a checkpoint get **Resumed** |
| **Created by** | The person who created the Job's Run. For Jobs of automation rules and hooks, the rule's or hook's owner |
| **Task** | The Task the Job was launched from |
| **Computer** | The computer that runs the Job |
| **GPU ID** | GPU IDs the Job uses. Site Jobs show a count such as `GPU ×2`; Jobs without GPUs show **CPU only** |
| **Execution location** | For site Jobs, the runner's host and the scheduler's job ID |
| **Launch source** | What started the Job when a person did not start it directly (table below) |
| **Attempt** | "Attempt / maximum attempts". A Job a person retried past its maximum shows, for example, `4 (automatic retries stop at attempt 3)` |
| **Created at** | When the Job was created |
| **Actions** | **Request stop**, **Rerun as a new run**, **Resume from latest checkpoint** ([Stop and retry](#stop-and-retry)) |

**Status** above the list filters by status, such as queued or failed.

The **Launch source** column shows:

| Example | Origin | Pressing it |
| --- | --- | --- |
| `Sweep: lr-search #3` | A Sweep trial (Sweep name and trial number) | Opens the Sweep |
| `Automation: infer on registration` | An automation rule (rule name) | — |
| `Hook: evaluate after training` | A [hook](/en/compute/hooks) | Opens the hook |
| `Parent job: 1a2b3c4d` | A child Job created by the code of a driver Job | Opens the parent Job's details |
| `array 3 / 10` | One member of a Job array (index / size) | Lists only the Jobs of that array |

When a person retries a Sweep or automation Job with **Rerun as a new run**, the new Job shows no Sweep or automation origin. The hook, parent Job, and array carry over to retries.

### Job arrays

When a hook, a driver, or the Python SDK's `create_job_array` starts an array on a site (a group of the same Job that differ only in their index), a **Job array** table appears above the list. It shows, per array, the states counted from the latest attempt of each index, the size, the computer, and the origin. Only Jobs loaded in the list are counted. **Show jobs** lists only that array's Jobs, and **Show all jobs** goes back.

## Launch a Job {#launch}

**Launch job** at the top right opens a dialog in three steps: **Execution settings**, **Execution computer**, and **Review**. Move with **Next** and **Back**. Editors and above can launch Jobs.

### 1. What to run

| Field | Contents |
| --- | --- |
| **Run name** | Name of the Run to create |
| **Experiments** | The Experiment that records the Run |
| **Run kind** | Training, fine-tuning, inference, evaluation, data processing |
| **Model version** | The input model version. Optional |
| **Code version** | The code to run |
| **Input dataset versions** | Dataset versions the worker fetches before running. Optional |
| **Parameters**, **Tags**, **Environment** | JSON |

**Code version** offers only code versions that support the chosen run kind and model version. When some do not, the count appears below the field, for example `Only code versions that match the run kind “Inference” and the model version can be selected (2 other versions hidden).` If the code you want is missing, change the run kind first. When none match, a link to **Register code** appears.

A choice that stops matching after you change another field is cleared, and the dialog says what was cleared.

| You changed | Cleared | Message |
| --- | --- | --- |
| Run kind, model version | Code version | The code version does not match the run kind or model version; choose again |
| Code version | Computer (and its GPUs) | The computer cannot use this code version's runtime; choose again |
| Computer | GPUs | The GPUs were cleared because the computer changed |

### 2. Where to run

| Field | Contents |
| --- | --- |
| **Computer** | The computer to run on. Only computers you can use that support the code version's runtime are offered |
| **GPUs (CPU only if none selected)** | Check GPUs registered on the computer. Without a GPU the Job runs on CPU only |
| **Maximum attempts** | 1 to 100, default 3. The limit of automatic retries; retries by people with **Rerun as a new run** do not count |
| **Allow this job's code to create child jobs (driver)** | Lets the Job's code create child Jobs with its Job token |

For a site, **GPU count**, **Time limit (HH:MM:SS, optional)**, **Restart from scratch on failure**, and **Retry from the latest checkpoint on timeout** appear instead of GPU IDs. Automatic retries happen only when a site Job has one of these two checked, and for [automation rule retries](/en/models/automation#retry-failures-automatically).

Without a computer for the runtime, `No computers support this runtime.` appears and you cannot continue.

A computer no worker takes is listed with `(No worker)` after its name, and one whose workers stopped answering with `(Worker offline)`. Choosing it shows a warning such as `No worker is assigned to “gpu-1”. If you launch now, the job stays queued until a worker runs.` and **Open worker setup**. You can still launch, but the Job does not start until a worker runs ([When a queued Job does not start](#queued-job-does-not-start)). Sites need no worker, so they are never marked.

### 3. Review

The settings so far and the runtime details of the code version are listed. For a manual-submission site, the command that submits the Job also appears here ([External computers (sites)](/en/compute/sites)). Check them and press **Launch job**.

The new Job is added to the list and its details open. The Run and the Job are created together: if the Job cannot be created, for example because the computer does not take Jobs, no Run is kept either. Fix the cause and press **Launch job** again.

### Launch from a Run

On the page of a Run with code, a button depends on whether the Run has a Job.

| Run | Button |
| --- | --- |
| Queued, without a Job | **Launch job**, for editors and above. Creates only the Job for that Run (the Run is not created again) |
| With a Job (also while running and after it ends) | **View job**. Opens the Job's details in **Jobs** |

## When a queued Job does not start {#queued-job-does-not-start}

Jobs on SSH and Local computers are picked up and run by a worker that takes that computer. A worker only takes Jobs of the Project its token was issued for, so a running worker of another Project does not start this Project's Jobs.

### Queued Jobs that cannot start

When a computer with queued Jobs has no worker, or its workers stopped answering, **Queued jobs that cannot start** appears above the list with:

- The count per computer, for example `gpu-1: 3 queued jobs`
- The worker state: **No worker**, or **Worker offline** with the time of the last answer
- **Open worker setup**, which opens the computer's details

The computer's owner runs the worker (a global administrator when it has no owner). The owner and global administrators see example commands under **Worker setup** in the computer's details. See [Install and run the worker](/en/compute/worker).

### The reason in the Job's details

The details of a queued Job show why it has not started above the fields.

| Message | Meaning | What to do |
| --- | --- | --- |
| `No worker is assigned to “gpu-1”.` | No worker of this Project takes Jobs of this computer | Ask the computer's owner to run a worker |
| `No worker for “gpu-1” is responding (last response: …).` | The worker for the computer has not answered for 2 minutes or more | Check `mado-tracking-worker status` and its log on the worker machine |
| `A worker for this computer is responding but has not taken this job yet. Possible reasons:` followed by the possible reasons | The worker is running but skips the Job for one of these: the computer's concurrent Job limit is reached, another Job holds the chosen GPUs, the computer is disabled, the computer lacks the code's runtime, or the computer is Local and the API server does not allow the local executor | For the limit and GPUs, wait for earlier Jobs to end or launch again on other GPUs or another computer. Check a disabled computer and its runtimes in **Global settings** → **Computers**, and the local executor with `MMT_ALLOW_LOCAL_EXECUTOR` ([Environment variables](/en/reference/environment)) |

Site Jobs need no worker. The phase next to the status (waiting for manual submission, in the scheduler queue, and so on) tells where they wait. For a manual-submission site, **Jobs waiting for manual submission** and the submit command appear above the list ([External computers (sites)](/en/compute/sites)).

### Check on the Available computers page

The computer list on the **Available computers** page also has a **Worker** column, so you can check before launching.

| Shown | Meaning |
| --- | --- |
| `2 workers online` | Number of workers that answer |
| **Worker offline** | Workers for the computer exist but stopped answering. The last answer is shown too |
| **No worker** | No worker takes this computer |
| **Not needed (site)** | A site needs no worker |

Global administrators also see **Worker (any project)** in a computer's details under **Global settings** → **Computers**. It counts the workers of every Project, so an online worker there does not mean one takes this Project's Jobs. Check on the **Available computers** page whether they start in this Project.

## Job details {#job-details}

Press a Job ID in the **Job** column to open its details below the list; the page scrolls there. The heading is the Run name. **Hide details** closes them. The URL gets `?job=<Job ID>`, so sharing it opens the same Job's details.

From top to bottom, the details show:

1. Why a queued Job has not started ([When a queued Job does not start](#queued-job-does-not-start))
2. Fields: Job ID, status, GPU ID, Heartbeat, **Exit code**, **Job error**. Site Jobs add the phase, time limit, scheduler job ID, submission time, runner host, job shell version, and automatic retries. Array index, parent Job, hook, and chain depth appear when they apply
3. The guide for Jobs waiting for manual submission (manual-submission sites)
4. The log
5. **Execution snapshot**: the Task revision, code version, command, and so on at launch ([Tasks and code versions](/en/models/tasks))

To find why a Job failed, look at **Job error** and **Exit code** first, then read the log.

## Read the log {#logs}

The log refreshes every 5 seconds while the Job is queued or running. A finished Job's log is read once when it opens.

- The latest 2,000 lines are shown. When there are more, the total is shown, for example `Showing the latest 2,000 of 12,345 lines.` **Load all lines** shows every line. For a log over 10,000 lines the button is **Load the latest 10,000 lines**; read older lines in the download.
- After loading more lines the view no longer refreshes. For a running Job, **Load new lines** reads again, and **Resume automatic updates** returns to the latest 2,000 lines.
- The view opens at the newest line and follows new lines while you stay there. Scrolling up to read stops following. **Jump to latest** goes back to the newest line.
- Times are shown to the second.
- Lines that redraw themselves with `\r`, such as tqdm progress bars, show only what was written last. The downloaded file keeps them as recorded.

| Control | Contents |
| --- | --- |
| **Level** | **All levels**, **Info**, **Warning**, **Error** |
| **Sort by** | **Oldest first**, **Newest first** |
| Search | Shows only lines that contain the words, ignoring case. The number of matches is shown, for example `3 matching lines` |
| **Download** | Saves every line as `<Run name>.log`, one entry per line with the time, level, and message separated by tabs. The server sends a long log as it reads it, so the browser does not hold all of it |

The level and search filters apply to the lines loaded. To search older lines while only the latest 2,000 are loaded, press **Load all lines** first. **Download** always saves every line, whatever is filtered or loaded. Characters of the Run name that cannot be used in file names become `_`.

## Stop and retry {#stop-and-retry}

The buttons in the **Actions** column stop or rerun a Job. Each opens a confirmation that names the Run, the creator, and the computer, and says what will happen.

| Button | Shown for | What it does |
| --- | --- | --- |
| **Request stop** | Queued, claimed, running | A queued Job (and a site Job still being submitted or in the scheduler queue) has not started, so it is canceled at once. For a running Job, the process is asked to stop, and the Job stays running until the worker stops it. In both cases, child Jobs created by this Job are stopped too |
| **Rerun as a new run** | Finished, failed, canceled | Creates a new Run and Job with the same settings, runs them, and opens the new Run. The original Run and Job are kept |
| **Resume from latest checkpoint** | Failed or canceled Jobs with a checkpoint to resume from, except trials stopped early by a Sweep | Continues from the newest saved checkpoint as a new Run ([Resume training](/en/models/checkpoints)) |

Press **Stop** or **Rerun** in the confirmation. After a stop is requested, **Request stop** is disabled and the status shows **Stop requested**.

### About retries

- A retry starts from the beginning. The Run is named like `<original Run name> (retry 2)` and keeps the code version, execution mode, Task revision, parameters, computer, and GPUs.
- Maximum attempts limits automatic retries only. People can retry a Job that reached its maximum attempts, including hook Jobs (maximum attempts 1 by default) and automation rule Jobs. Past the limit, the **Attempt** column shows `2 (automatic retries stop at attempt 1)`.
- Retries traced back from the same Job are limited to attempt 100.
- One Job gets at most one retry (resuming from a checkpoint included). Pressing **Rerun as a new run** again on a Job that was already retried opens the Run created before. To run it once more, retry from the row of the Job that the retry created.

### Who can stop and retry

Only the Job's creator (the creator of its Run) and Project admins can stop, retry, or resume a Job from a checkpoint. In other people's rows, the **Actions** column shows `Only the creator or a project administrator can stop or rerun` instead of buttons. For automation rule and hook Jobs, the creator is the rule's or hook's owner; when the owner is a Service Account, a Project admin retries them.

## Permissions

| Action | Required role |
| --- | --- |
| View the Job list, details, and logs | viewer or higher |
| Launch a Job | editor or higher (`runs:write` and `jobs:write` for API tokens) |
| Stop, retry, resume from a checkpoint | The creator of the Job's Run (editor or higher) or a Project admin (`jobs:write` for API tokens) |
