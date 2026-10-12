"""Seeds the sample environment with the data the documentation screenshots show.

Creates the sample Project (training → automatic registration → inference → evaluation →
promotion, a Sweep, audio data, notes, comments, a saved view and a report), the storage
settings and a notification channel, and runs the training Jobs on a local CPU worker. Every name
and text exists in Japanese and English (--lang). The IDs and names go to seed-state.json in the
environment directory; a rerun continues from where a failed run stopped. Tokens are never printed
or saved: the worker receives its token in its environment.

    node pages/scripts/screenshots/serve-environment.mjs start sample --lang en
    PYTHONPATH=python/src <python> pages/scripts/screenshots/seed_sample_project.py --lang en

The Python needs httpx, numpy, Pillow and psutil (mado-tracking[media,telemetry]) and pip, which
the worker uses to install each Job's requirements.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from mado_tracking import Client
from mado_tracking.code_version import build_code_version_payload
from mado_tracking.sweeps import convert_sweep_config

from sample_text import SAMPLE_TEXTS, SampleText
from screenshot_environment import REPOSITORY_ROOT, Environment, load_environment
from synthetic_vowels import SAMPLE_RATE, VOWEL_SECONDS, prepare_audio_directory

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
EXAMPLES = REPOSITORY_ROOT / "python/examples"
SAMPLE_CODE = SCRIPT_DIRECTORY / "sample_code"
TERMINAL = {"finished", "failed", "canceled", "skipped"}
FAMILY = "linear"
ALIAS = "production"
INFERENCE_VALUES = (0.0, 1.0, 2.0)
SECONDS_PER_PREDICTION_UNIT = 0.1
# The first version trains briefly and keeps a small error; the second trains longer and beats it.
ROUND_PARAMETERS = {
    1: {"steps": 20, "learning_rate": 0.05, "momentum": 0.5, "step_seconds": 1.0},
    2: {"steps": 60, "learning_rate": 0.1, "momentum": 0.5, "step_seconds": 0.5},
}
JOB_DEADLINE_SECONDS = 600
SWEEP_DEADLINE_SECONDS = 900
WORKER_ID = "preview-voice-cpu"
# Environment variable names only: the channel shows "not set" because no value is configured.
NOTIFICATION_URL_ENV = "MMT_NOTIFICATION_TEAM_WEBHOOK_URL"
NOTIFICATION_SECRET_ENV = "MMT_NOTIFICATION_TEAM_WEBHOOK_SECRET"
ARCHIVE_STORAGE_NAME = "archive-fs"
S3_STORAGE_NAME = "lab-minio"
# An S3 storage that is never reached: the Storage page only lists it.
S3_STORAGE_SETTINGS = {
    "endpoint": "https://minio.example.internal:9000",
    "region": "us-east-1",
    "bucket": "mmt-artifacts",
    "pathStyle": True,
    "signatureVersion": "v2",
    "accessKeyId": "AKIAEXAMPLEDOCS00000",
}


def log(message: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


class Seed:
    """The state of one seeding: the environment, the text of its language and the saved IDs."""

    def __init__(self, environment: Environment, text: SampleText):
        self.environment = environment
        self.text = text
        # What capture-sample-project.mjs reads: IDs, local paths and the names used.
        self.state_file = environment.directory / "seed-state.json"
        # Jobs, the worker's state and the generated audio files.
        self.seed_directory = environment.directory / "seed"
        self.state: dict[str, Any] = (
            json.loads(self.state_file.read_text()) if self.state_file.exists() else {}
        )

    def save(self) -> None:
        self.state_file.write_text(json.dumps(self.state, ensure_ascii=False, indent=2) + "\n")


def expires_in(days: float) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat().replace("+00:00", "Z")


class Api:
    def __init__(self, session: httpx.Client):
        self.session = session
        self.project_id = ""

    def call(self, method: str, path: str, **options: Any) -> Any:
        response = self.session.request(method, path, **options)
        if not response.is_success:
            raise RuntimeError(f"{method} {path}: HTTP {response.status_code} {response.text[:800]}")
        return response.json() if response.content else None

    def p(self, method: str, resource: str, **options: Any) -> Any:
        return self.call(method, f"projects/{self.project_id}/{resource}", **options)

    def run(self, run_id: str) -> dict[str, Any]:
        return self.p("GET", f"runs/{run_id}")


def wait_for(description: str, check, *, deadline_seconds: float = JOB_DEADLINE_SECONDS, every: float = 2.0):
    deadline = time.monotonic() + deadline_seconds
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(every)
    raise RuntimeError(f"timed out waiting for {description}")


def wait_runs(api: Api, run_ids: list[str]) -> list[dict[str, Any]]:
    def done():
        runs = [api.run(run_id) for run_id in run_ids]
        return runs if all(run["status"] in TERMINAL for run in runs) else None

    return wait_for(f"Runs {run_ids}", done)


# --- Project, people, computer ------------------------------------------------------------------
def ensure_project(api: Api, seed: Seed) -> None:
    if "projectId" not in seed.state:
        project = api.call(
            "POST",
            "projects",
            json={
                "name": seed.text.project_name,
                "description": seed.text.project_description,
                "visibility": "private",
                "artifactBackend": "filesystem",
            },
        )
        seed.state["projectId"] = project["id"]
        seed.save()
    api.project_id = seed.state["projectId"]


def ensure_people(api: Api, seed: Seed, sessions: dict[str, httpx.Client]) -> None:
    """Development-login researcher and reviewer, SSO group bindings and a local account."""
    state = seed.state
    # Signed in on every run: a rerun posts the researcher's comment with this session.
    people = {
        key: Api(sessions[key]).call("POST", "auth/dev-login", json={"email": email})["user"]["id"]
        for key, email in (("researcher", "researcher@example.test"), ("reviewer", "reviewer@example.test"))
    }
    if "people" not in state:
        for key, role in (("researcher", "editor"), ("reviewer", "viewer")):
            api.p("PUT", f"members/{people[key]}", json={"role": role})
        state["people"] = people
        seed.save()
    if "groupBindings" not in state:
        for group, role in (("mmt-voice-researchers", "editor"), ("mmt-voice-reviewers", "viewer")):
            api.p("PUT", f"group-bindings/{group}", json={"role": role})
        state["groupBindings"] = ["mmt-voice-researchers", "mmt-voice-reviewers"]
        seed.save()
    if "localAccountId" not in state:
        # A throwaway random password that is never shown; reset it on the Users page to sign in.
        try:
            created = api.call(
                "POST",
                "admin/users",
                json={
                    "username": "voice-demo",
                    "displayName": seed.text.local_account_name,
                    "email": "voice-demo@example.test",
                    "password": secrets.token_urlsafe(24),
                    "isAdmin": False,
                },
            )
            state["localAccountId"] = created["id"]
        except RuntimeError as error:
            if "username_taken" not in str(error):
                raise
            users = api.call("GET", "admin/users", params={"query": "voice-demo"})["items"]
            state["localAccountId"] = users[0]["id"]
        api.p("PUT", f"members/{state['localAccountId']}", json={"role": "viewer"})
        seed.save()


def ensure_service_accounts(api: Api, seed: Seed) -> None:
    if "workerServiceAccountId" in seed.state:
        return
    worker = api.p(
        "POST",
        "service-accounts",
        json={
            "name": "voice-cpu-worker",
            "description": seed.text.worker_account_description,
            "role": "admin",
        },
    )
    automation = api.p(
        "POST",
        "service-accounts",
        json={
            "name": "voice-automation",
            "description": seed.text.automation_account_description,
            "role": "admin",
        },
    )
    seed.state.update(workerServiceAccountId=worker["id"], automationServiceAccountId=automation["id"])
    seed.save()


def ensure_target_and_experiments(api: Api, seed: Seed) -> None:
    state = seed.state
    # The capture script replaces this local path with the docs' example on the screens.
    jobs = seed.seed_directory / "jobs"
    jobs.mkdir(parents=True, exist_ok=True)
    state["jobsDirectory"] = str(jobs)
    seed.save()
    if "targetId" not in state:
        target = api.call(
            "POST",
            "targets",
            json={
                "name": seed.text.computer_name,
                "host": "127.0.0.1",
                "port": 22,
                "username": "local",
                "sshKeyPath": "",
                "knownHostsPath": "",
                "workDirectory": str(jobs),
                "pythonExecutable": sys.executable,
                "runtimeKinds": ["python"],
                "gpuIds": [],
                "maxConcurrentJobs": 2,
                "enabled": True,
                "executor": "local",
                "visibility": "public",
            },
        )
        state["targetId"] = target["id"]
        seed.save()
    if "experiments" not in state:
        state["experiments"] = {
            key: api.p("POST", "experiments", json={"name": name, "description": description})["id"]
            for key, (name, description) in seed.text.experiments.items()
        }
        seed.save()


def localized_source(seed: Seed, file_name: str, source: str) -> str:
    for original, shown in seed.text.source_replacements.get(file_name, []):
        if original not in source:
            raise RuntimeError(f"{file_name} no longer contains the text to translate: {original[:60]}")
        source = source.replace(original, shown)
    return source


def code_files(seed: Seed, paths: list[Path]) -> dict[str, str]:
    return {path.name: localized_source(seed, path.name, path.read_text()) for path in paths}


def code_version(
    api: Api,
    seed: Seed,
    *,
    key: str,
    files: dict[str, str],
    entrypoint: list[str],
    task_type: str,
    requirements: list[str],
) -> str:
    code = api.p(
        "POST", "codes", json={"name": seed.text.code_names[key], "description": seed.text.code_description}
    )
    version = api.p(
        "POST",
        f"codes/{code['id']}/versions",
        json=build_code_version_payload(
            version="v1",
            source={"kind": "inline", "files": files},
            entrypoint=entrypoint,
            test_entrypoint=[],
            runtime=None,
            requirements=requirements,
            environment=None,
            supported_model_families=[FAMILY],
            task_types=[task_type],
        ),
    )
    return version["id"]


def ensure_codes(api: Api, seed: Seed) -> None:
    if "codes" in seed.state:
        return
    seed.state["codes"] = {
        "training": code_version(
            api,
            seed,
            key="training",
            files=code_files(
                seed,
                [SAMPLE_CODE / "voice_training.py", EXAMPLES / "training.py", EXAMPLES / "media_logging.py"],
            ),
            entrypoint=["python", "voice_training.py"],
            task_type="training",
            requirements=["numpy>=1.26"],
        ),
        "inference": code_version(
            api,
            seed,
            key="inference",
            files=code_files(seed, [EXAMPLES / "inference.py"]),
            entrypoint=["python", "inference.py"],
            task_type="inference",
            requirements=[],
        ),
        "evaluation": code_version(
            api,
            seed,
            key="evaluation",
            files=code_files(seed, [EXAMPLES / "evaluation.py"]),
            entrypoint=["python", "evaluation.py"],
            task_type="evaluation",
            requirements=[],
        ),
        "sweep": code_version(
            api,
            seed,
            key="sweep",
            files=code_files(seed, [EXAMPLES / "sweep_training.py", SAMPLE_CODE / "sweep_trial.py"]),
            entrypoint=["python", "sweep_trial.py"],
            task_type="training",
            requirements=[],
        ),
    }
    seed.save()


def reference_samples() -> list[dict[str, Any]]:
    return [
        {
            "audio": f"sample-{index:03d}.wav",
            "durationSeconds": round((2 * x + 1) * SECONDS_PER_PREDICTION_UNIT, 6),
        }
        for index, x in enumerate(INFERENCE_VALUES)
    ]


def ensure_registry(api: Api, seed: Seed) -> None:
    state = seed.state
    if "modelId" in state:
        return
    samples = reference_samples()
    reference_name, reference_description = seed.text.reference_dataset
    reference = api.p(
        "POST",
        "datasets",
        json={"name": reference_name, "namespace": "voice", "description": reference_description},
    )
    state["referenceDatasetVersionId"] = api.p(
        "POST",
        f"datasets/{reference['id']}/versions",
        json={
            "version": "v1",
            "uri": "urn:mmt:preview:voice-reference-lengths",
            "digest": "sha256:" + hashlib.sha256(json.dumps(samples).encode()).hexdigest(),
            "schema": {"audio": "string", "durationSeconds": "number"},
            "metadata": {"samples": samples},
        },
    )["id"]
    output_name, output_description = seed.text.inference_output_dataset
    state["inferenceOutputDatasetId"] = api.p(
        "POST",
        "datasets",
        json={"name": output_name, "namespace": "voice", "description": output_description},
    )["id"]
    state["modelId"] = api.p(
        "POST",
        "models",
        json={"name": "voice-tts-demo", "family": FAMILY, "description": seed.text.model_description},
    )["id"]
    seed.save()


def ensure_rules_and_policy(api: Api, seed: Seed) -> None:
    state = seed.state
    if "promotionPolicyId" in state:
        return
    common = {
        "experimentId": state["experiments"]["training"],
        "targetId": state["targetId"],
        "maxAttempts": 1,
    }
    inference = api.p(
        "POST",
        "automation-rules",
        json={
            **common,
            "name": seed.text.inference_rule_name,
            "modelFamilies": [FAMILY],
            "kind": "inference",
            "codeVersionId": state["codes"]["inference"],
            "trigger": "model_registered",
            "parameters": {"outputDatasetId": state["inferenceOutputDatasetId"]},
        },
    )
    evaluation = api.p(
        "POST",
        "automation-rules",
        json={
            **common,
            "name": seed.text.evaluation_rule_name,
            "modelFamilies": [FAMILY],
            "kind": "evaluation",
            "codeVersionId": state["codes"]["evaluation"],
            "trigger": "upstream_run_finished",
            "upstreamRuleId": inference["id"],
            "inputDatasetVersionIds": [state["referenceDatasetVersionId"]],
            "parameters": {},
            "summaryMetrics": [
                "evaluation.duration_match_rate",
                "evaluation.duration_mean_abs_error_seconds",
            ],
        },
    )
    policy = api.p(
        "POST",
        "promotion-policies",
        json={
            "name": seed.text.promotion_policy_name,
            "modelId": state["modelId"],
            "targetAlias": ALIAS,
            "baselineAlias": ALIAS,
            "evaluationRuleId": evaluation["id"],
            "autoPromote": True,
            "criteria": [
                {
                    "metric": "evaluation.duration_match_rate",
                    "direction": "higher",
                    "mode": "absolute",
                    "threshold": 0.99,
                },
                {
                    "metric": "evaluation.duration_mean_abs_error_seconds",
                    "direction": "lower",
                    "mode": "delta",
                    "threshold": 0.0,
                },
            ],
        },
    )
    automation = state["automationServiceAccountId"]
    for rule_id in (inference["id"], evaluation["id"]):
        api.p("PUT", f"automation-rules/{rule_id}/owner", json={"serviceAccountId": automation})
    api.p("PUT", f"promotion-policies/{policy['id']}/owner", json={"serviceAccountId": automation})
    state.update(
        inferenceRuleId=inference["id"], evaluationRuleId=evaluation["id"], promotionPolicyId=policy["id"]
    )
    seed.save()


def ensure_tasks(api: Api, seed: Seed) -> None:
    state = seed.state
    if "trainingTaskId" not in state:
        state["trainingTaskId"] = api.p(
            "POST",
            "tasks",
            json={
                "experimentId": state["experiments"]["training"],
                "name": seed.text.code_names["training"],
                "kind": "training",
                "codeVersionId": state["codes"]["training"],
                "parameters": ROUND_PARAMETERS[1],
                "targetId": state["targetId"],
                "outputModel": {
                    "modelId": state["modelId"],
                    "createModel": None,
                    "artifactPath": "model/weights.json",
                    "metadata": {"note": seed.text.output_model_note},
                },
            },
        )["id"]
        seed.save()
    if "sweepTaskId" not in state:
        state["sweepTaskId"] = api.p(
            "POST",
            "tasks",
            json={
                "experimentId": state["experiments"]["sweep"],
                "name": seed.text.code_names["sweep"],
                "kind": "training",
                "codeVersionId": state["codes"]["sweep"],
                "parameters": {"epochs": 8},
                "targetId": state["targetId"],
            },
        )["id"]
        seed.save()


# --- worker -------------------------------------------------------------------------------------
def worker_pid_file(seed: Seed) -> Path:
    # serve-environment.mjs stop ends every process with a .pid file in the environment directory.
    return seed.environment.directory / "worker.pid"


def worker_running(seed: Seed) -> bool:
    pid_file = worker_pid_file(seed)
    if not pid_file.exists():
        return False
    pid = int(pid_file.read_text())
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return "sample_worker.py" in Path(f"/proc/{pid}/cmdline").read_bytes().decode(errors="replace")


def jobs_remaining(seed: Seed) -> bool:
    """Whether a step that needs the worker (the check, training, the Sweep) is still to run."""
    state = seed.state
    finished = (
        state.get("targetCheckDone"),
        state.get("round1", {}).get("done"),
        state.get("round2", {}).get("done"),
        state.get("sweepDone"),
    )
    return not all(finished)


def ensure_worker(api: Api, seed: Seed) -> None:
    state = seed.state
    if not jobs_remaining(seed):
        # A rerun on a seeded environment adds no second worker token to the token lists.
        return
    if worker_running(seed):
        log("the worker is running")
        return
    issued = api.p(
        "POST",
        f"service-accounts/{state['workerServiceAccountId']}/tokens",
        json={
            "name": "preview cpu worker",
            "scopes": ["read", "worker:execute", "artifacts:write", "registry:write"],
            "expiresAt": expires_in(7),
        },
    )
    state["workerTokenId"] = issued["item"]["id"]
    seed_directory = seed.seed_directory
    seed_directory.mkdir(parents=True, exist_ok=True)
    environment = {name: value for name, value in os.environ.items() if not name.startswith("MMT_")}
    environment.update(
        MMT_API_URL=seed.environment.api_url,
        MMT_API_TOKEN=issued["token"],
        MMT_WORKER_ID=WORKER_ID,
        MMT_WORKER_TARGET_IDS=state["targetId"],
        MMT_WORKER_STATE_DIR=str(seed_directory / "worker-state"),
        PYTHONPATH=str(REPOSITORY_ROOT / "python/src"),
    )
    log_file = (seed_directory / "worker.log").open("ab")
    process = subprocess.Popen(
        [sys.executable, str(SCRIPT_DIRECTORY / "sample_worker.py")],
        cwd=seed_directory,
        env=environment,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    worker_pid_file(seed).write_text(f"{process.pid}\n")
    seed.save()
    log(f"started the worker (pid {process.pid})")


def ensure_target_check(api: Api, seed: Seed) -> None:
    """A finished connection check of the sample computer, shown on the Computers page."""
    state = seed.state
    if state.get("targetCheckDone"):
        return
    # A check names a worker that is online; a freshly started worker appears after its heartbeat.
    wait_for(
        "the worker to be online",
        lambda: any(
            item["workerId"] == WORKER_ID and item["tokenId"] == state["workerTokenId"]
            for item in api.call("GET", "targets/check-workers")["items"]
        ),
    )
    check = api.call(
        "POST",
        f"targets/{state['targetId']}/checks",
        json={"worker": {"tokenId": state["workerTokenId"], "workerId": WORKER_ID}},
    )
    wait_for(
        "connection check",
        lambda: next(
            (
                item
                for item in api.call("GET", f"targets/{state['targetId']}/checks")["items"]
                if item["id"] == check["id"] and item["status"] not in {"queued", "running"}
            ),
            None,
        ),
    )
    state["targetCheckDone"] = True
    seed.save()


# --- training → registration → inference → evaluation → promotion --------------------------------
def run_round(api: Api, seed: Seed, round_number: int) -> None:
    state = seed.state
    key = f"round{round_number}"
    record = state.setdefault(key, {})
    if record.get("done"):
        return
    if "trainingRunId" not in record:
        task = api.p("GET", f"tasks/{state['trainingTaskId']}")
        parameters = ROUND_PARAMETERS[round_number]
        launched = api.p(
            "POST",
            f"tasks/{state['trainingTaskId']}/launch",
            json={
                "expectedRevision": task["revision"],
                "executionMode": "run",
                "name": seed.text.training_run_name.format(round_number=round_number, **parameters),
                "parameters": parameters,
            },
        )
        record["trainingRunId"] = launched["run"]["id"]
        seed.save()
    log(f"{key}: waiting for the training Run {record['trainingRunId']}")
    (training,) = wait_runs(api, [record["trainingRunId"]])
    if training["status"] != "finished":
        raise RuntimeError(f"{key}: training ended {training['status']}")
    registration = wait_for(
        "output registration",
        lambda: (lambda value: value if value["status"] in {"registered", "failed", "skipped"} else None)(
            api.p("GET", f"runs/{record['trainingRunId']}/output-registration")
        ),
    )
    if registration["status"] != "registered":
        raise RuntimeError(f"{key}: registration {registration}")
    version_id = record["versionId"] = registration["modelVersionId"]
    seed.save()

    def execution_of(rule_id: str, matches) -> dict[str, Any] | None:
        items = api.p("GET", "automation-executions", params={"ruleId": rule_id, "limit": "200"})["items"]
        found = [item for item in items if matches(item) and item.get("runId")]
        return found[0] if found else None

    inference = wait_for(
        "inference execution",
        lambda: execution_of(state["inferenceRuleId"], lambda item: item["modelVersionId"] == version_id),
    )
    record["inferenceRunId"] = inference["runId"]
    log(f"{key}: waiting for the inference Run {inference['runId']}")
    (inference_run,) = wait_runs(api, [inference["runId"]])
    if inference_run["status"] != "finished":
        raise RuntimeError(f"{key}: inference ended {inference_run['status']}")
    evaluation = wait_for(
        "evaluation execution",
        lambda: execution_of(
            state["evaluationRuleId"], lambda item: item["triggerRunId"] == inference["runId"]
        ),
    )
    record["evaluationRunId"] = evaluation["runId"]
    log(f"{key}: waiting for the evaluation Run {evaluation['runId']}")
    (evaluation_run,) = wait_runs(api, [evaluation["runId"]])
    if evaluation_run["status"] != "finished":
        raise RuntimeError(f"{key}: evaluation ended {evaluation_run['status']}")
    decision = wait_for(
        "promotion decision",
        lambda: (
            api.p(
                "GET",
                "promotion-evaluations",
                params={"policyId": state["promotionPolicyId"], "candidateVersionId": version_id},
            )["items"]
            or None
        ),
    )[0]
    record["decision"] = {
        k: decision.get(k) for k in ("id", "decision", "reason", "promoted", "baselineVersionId")
    }
    record["aliases"] = api.p("GET", f"model-versions/{version_id}")["aliases"]
    record["done"] = True
    seed.save()
    log(f"{key}: decision {record['decision']} aliases={record['aliases']}")


# --- Sweep --------------------------------------------------------------------------------------
def run_sweep(api: Api, seed: Seed) -> None:
    state = seed.state
    if state.get("sweepDone"):
        return
    if "sweepId" not in state:
        config = {
            "method": "grid",
            "metric": {"name": "val_loss", "goal": "minimize"},
            "parameters": {"lr": {"values": [0.01, 0.05, 0.2]}, "batch_size": {"values": [4, 16]}},
            "run_cap": 6,
            "parallelism": 2,
            "early_terminate": {"type": "hyperband", "min_iter": 2, "eta": 2},
        }
        created = api.p(
            "POST",
            "sweeps",
            json={
                "name": "lr×batch_size grid",
                "taskId": state["sweepTaskId"],
                **convert_sweep_config(config),
                "targetId": None,
                "gpuIds": None,
            },
        )
        state["sweepId"] = created["id"]
        seed.save()
    log(f"waiting for the Sweep {state['sweepId']}")
    sweep = wait_for(
        "sweep end",
        lambda: (
            lambda value: value if value["status"] in {"finished", "failed", "canceled", "paused"} else None
        )(api.p("GET", f"sweeps/{state['sweepId']}")),
        deadline_seconds=SWEEP_DEADLINE_SECONDS,
        every=5,
    )
    state["sweep"] = {k: sweep.get(k) for k in ("status", "statusReason", "trialCounts")}
    state["sweepDone"] = sweep["status"] == "finished"
    seed.save()
    log(f"Sweep: {state['sweep']}")


# --- audio data ---------------------------------------------------------------------------------
def seed_audio_data(api: Api, seed: Seed, token: str) -> None:
    state = seed.state
    if state.get("audioDone"):
        return
    base = seed.seed_directory / "audio-data"
    v1 = base / "v1"
    v2 = base / "v2"
    prepare_audio_directory(v1, ["a", "i", "u"], pitch=140)
    prepare_audio_directory(v2, ["a", "i", "u", "e", "o"], pitch=140)
    first_note, second_note = seed.text.audio_version_notes
    with Client(api_url=seed.environment.api_url, api_token=token) as client:
        first = client.register_dataset(
            api.project_id,
            files=v1,
            name=seed.text.audio_dataset_name,
            namespace="voice",
            description=seed.text.audio_dataset_description,
            version="v1",
            metadata={"sampleRate": SAMPLE_RATE, "note": first_note},
        )
        second = client.register_dataset(
            api.project_id,
            files=v2,
            dataset_id=first["datasetId"],
            version="v2",
            metadata={"sampleRate": SAMPLE_RATE, "note": second_note},
        )
        # The data preparation Run keeps the WAV files too, to play them from the Run's Artifacts.
        run = client.start_run(
            project_id=api.project_id,
            experiment_id=state["experiments"]["data"],
            name=seed.text.data_run_name,
            kind="processing",
            parameters={"sampleRate": SAMPLE_RATE, "pitchHz": 140, "vowels": "aiueo"},
        )
        with run:
            for path in sorted(v2.iterdir()):
                mime = "audio/wav" if path.suffix == ".wav" else "application/x-ndjson"
                run.log_artifact(path, path=f"data/{path.name}", mime_type=mime)
            wav_count = len(list(v2.glob("*.wav")))
            run.log_metrics(
                {"data.files": float(wav_count), "data.seconds": VOWEL_SECONDS * wav_count}, step=0
            )
    state.update(
        audioDatasetId=first["datasetId"],
        audioDatasetVersionIds=[first["id"], second["id"]],
        audioSampleDirectory=str(v2),
        dataRunId=run.id,
        audioDone=True,
    )
    seed.save()
    log(f"audio data: dataset {first['datasetId']} v1/v2, Run {run.id}")


# --- notes, comments, saved view, report --------------------------------------------------------
def seed_notes(api: Api, seed: Seed, researcher: Api) -> None:
    state = seed.state
    if state.get("notesDone"):
        return
    second = state["round2"]["trainingRunId"]
    first = state["round1"]["trainingRunId"]
    api.p("PUT", f"runs/{second}/note", json={"content": seed.text.second_run_note})
    api.p("PUT", f"runs/{first}/note", json={"content": seed.text.first_run_note})
    thread = researcher.p(
        "POST",
        "comments",
        json={"targetType": "run", "targetId": second, "body": seed.text.researcher_comment},
    )
    api.p(
        "POST",
        "comments",
        json={
            "targetType": "run",
            "targetId": second,
            "parentCommentId": thread["id"],
            "body": seed.text.admin_reply,
        },
    )
    # A deleted comment stays as a placeholder in the thread, as the comments page describes.
    deleted = api.p(
        "POST", "comments", json={"targetType": "run", "targetId": second, "body": seed.text.deleted_comment}
    )
    api.p("DELETE", f"comments/{deleted['id']}")
    version = state["round2"]["versionId"]
    api.p(
        "POST",
        "comments",
        json={"targetType": "model_version", "targetId": version, "body": seed.text.version_comment},
    )
    state["notesDone"] = True
    seed.save()


def chart_panel(panel_id: str, *, title: str, metric_keys: list[str], y: int = 0) -> dict[str, Any]:
    return {
        "id": panel_id,
        "title": title,
        "metricKeys": metric_keys,
        "xAxis": {"kind": "step"},
        "yScale": "linear",
        "smoothing": {"kind": "ema", "weight": 0.3},
        "showRange": False,
        "layout": {"x": 0, "y": y, "w": 12, "h": 4},
    }


def seed_saved_view(api: Api, seed: Seed) -> None:
    state = seed.state
    if "savedViewId" in state:
        return
    view_state = {
        "version": 1,
        "experimentIds": [state["experiments"]["training"]],
        "filter": "",
        "orderBy": [],
        "statuses": ["finished"],
        "kinds": ["training"],
        "columns": [
            {"key": "name"},
            {"key": "status"},
            {"key": "params.steps"},
            {"key": "params.learning_rate"},
            {"key": "metrics.train.loss", "width": 140},
            {"key": "metrics.val.accuracy", "width": 140},
        ],
        "chartPanels": {
            "version": 1,
            "columns": 12,
            "panels": [
                chart_panel(
                    "view-loss", title="train.loss / val.loss", metric_keys=["train.loss", "val.loss"]
                ),
                chart_panel(
                    "view-accuracy", title="accuracy", metric_keys=["train.accuracy", "val.accuracy"], y=4
                ),
            ],
        },
    }
    created = api.p(
        "POST",
        "saved-views",
        json={
            "visibility": "project",
            "page": "runs",
            "name": seed.text.saved_view_name,
            "state": view_state,
        },
    )
    state["savedViewId"] = created["id"]
    seed.save()


def seed_report(api: Api, seed: Seed) -> None:
    state = seed.state
    if "reportId" in state:
        return
    trainings = [state["round1"]["trainingRunId"], state["round2"]["trainingRunId"]]
    sweep = {"sweepId": state["sweepId"]}
    blocks = [
        {"id": "intro", "type": "markdown", "text": seed.text.report_intro},
        {
            "id": "loss",
            "type": "chart",
            "panel": chart_panel("loss", title=seed.text.live_chart_title, metric_keys=["train.loss"]),
            "runSet": {"runIds": trainings},
            "mode": "live",
        },
        {
            "id": "accuracy",
            "type": "chart",
            "panel": chart_panel(
                "accuracy", title=seed.text.snapshot_chart_title, metric_keys=["val.accuracy"]
            ),
            "runSet": {"runIds": trainings},
            "mode": "snapshot",
        },
        {"id": "tones", "type": "media", "runIds": trainings, "key": "samples/tone", "mode": "snapshot"},
        {"id": "sweep-head", "type": "markdown", "text": seed.text.report_sweep_heading},
        {
            "id": "parallel",
            "type": "parallel_coordinates",
            "runSet": sweep,
            "params": ["lr", "batch_size"],
            "metric": "val_loss",
            "mode": "snapshot",
        },
        {"id": "importance", "type": "parameter_importance", "runSet": sweep, "mode": "snapshot"},
        {
            "id": "runs",
            "type": "run_table",
            "runSet": {"savedViewId": state["savedViewId"]},
            "columns": [
                "name",
                "status",
                "params.steps",
                "params.learning_rate",
                "metrics.train.loss",
                "metrics.val.accuracy",
            ],
            "limit": 20,
            "mode": "live",
        },
    ]
    created = api.p("POST", "reports", json={"title": seed.text.report_title, "blocks": blocks})
    state["reportId"] = created["report"]["id"]
    api.p(
        "POST",
        "comments",
        json={"targetType": "report", "targetId": state["reportId"], "body": seed.text.report_comment},
    )
    seed.save()


# --- global settings: storage and notifications -------------------------------------------------
def seed_storage(api: Api, seed: Seed) -> None:
    """A second filesystem storage and an S3 storage next to the default one."""
    state = seed.state
    if state.get("storageDone"):
        return
    archive = seed.seed_directory / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    existing = {item["name"] for item in api.call("GET", "admin/storage-backends")["items"]}
    if ARCHIVE_STORAGE_NAME not in existing:
        api.call(
            "POST",
            "admin/storage-backends",
            json={"name": ARCHIVE_STORAGE_NAME, "kind": "filesystem", "rootPath": str(archive)},
        )
    if S3_STORAGE_NAME not in existing:
        api.call(
            "POST",
            "admin/storage-backends",
            json={
                "name": S3_STORAGE_NAME,
                "kind": "s3",
                **S3_STORAGE_SETTINGS,
                # Never used to connect; a random value so that no real-looking secret is stored.
                "secretAccessKey": secrets.token_urlsafe(30),
            },
        )
    state.update(storageDone=True, archiveDirectory=str(archive))
    seed.save()


def seed_notifications(api: Api, seed: Seed) -> None:
    """A Project webhook channel and a rule that sends failed Runs to it."""
    state = seed.state
    if state.get("notificationsDone"):
        return
    channel = api.call(
        "POST",
        "notification-channels",
        json={
            "projectId": api.project_id,
            "kind": "webhook",
            "name": seed.text.notification_channel_name,
            "urlEnv": NOTIFICATION_URL_ENV,
            "secretEnv": NOTIFICATION_SECRET_ENV,
        },
    )
    api.call(
        "POST",
        f"projects/{api.project_id}/notification-rules",
        json={"channelId": channel["id"], "eventTypes": ["run.failed"]},
    )
    state["notificationsDone"] = True
    seed.save()


def save_names(seed: Seed) -> None:
    """The names the capture script looks for on the screens."""
    text = seed.text
    seed.state["names"] = {
        "computer": text.computer_name,
        "audioDataset": text.audio_dataset_name,
        "trainingCode": text.code_names["training"],
        "trainingTask": text.code_names["training"],
        "evaluationRule": text.evaluation_rule_name,
    }
    seed.save()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--lang", choices=sorted(SAMPLE_TEXTS), default="ja")
    arguments = parser.parse_args()
    environment = load_environment(arguments.lang, "sample")
    seed = Seed(environment, SAMPLE_TEXTS[arguments.lang])
    save_names(seed)
    # The API checks Origin on cookie requests; it is the Web origin, not a connection target.
    headers = {"Origin": environment.web_url}
    base_url = f"{environment.api_url}/api/"
    with (
        httpx.Client(base_url=base_url, headers=headers, timeout=60) as admin_session,
        httpx.Client(base_url=base_url, headers=headers, timeout=60) as researcher_session,
        httpx.Client(base_url=base_url, headers=headers, timeout=60) as reviewer_session,
    ):
        api = Api(admin_session)
        api.call("POST", "auth/dev-login", json={})
        ensure_project(api, seed)
        ensure_people(api, seed, {"researcher": researcher_session, "reviewer": reviewer_session})
        researcher = Api(researcher_session)
        researcher.project_id = api.project_id
        ensure_service_accounts(api, seed)
        ensure_target_and_experiments(api, seed)
        ensure_codes(api, seed)
        ensure_registry(api, seed)
        ensure_rules_and_policy(api, seed)
        ensure_tasks(api, seed)
        ensure_worker(api, seed)
        log(f"project {api.project_id}")
        ensure_target_check(api, seed)
        run_round(api, seed, 1)
        run_round(api, seed, 2)
        run_sweep(api, seed)
        setup = api.call(
            "POST",
            "tokens",
            json={
                "name": "preview seed (1h)",
                "kind": "personal",
                "projectId": api.project_id,
                "scopes": ["read", "runs:write", "registry:write", "artifacts:write"],
                "expiresAt": expires_in(1 / 24),
            },
        )
        try:
            seed_audio_data(api, seed, setup["token"])
        finally:
            api.call("DELETE", f"tokens/{setup['item']['id']}")
        seed_notes(api, seed, researcher)
        seed_saved_view(api, seed)
        seed_report(api, seed)
        seed_storage(api, seed)
        seed_notifications(api, seed)
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
