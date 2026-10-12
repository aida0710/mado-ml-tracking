"""The running screenshot environments, as serve-environment.mjs describes them, for the Python seeds."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Environment:
    """The servers and the state directory of one environment (sample or accounts) in one language."""

    api_url: str
    web_url: str
    directory: Path


def load_environment(lang: str, name: str) -> Environment:
    # The same directory as environmentDirectory() in screenshotEnvironment.mjs.
    state_root = Path(os.environ.get("MMT_DOCS_STATE_DIR", REPOSITORY_ROOT / "var/docs-screenshots"))
    directory = state_root / lang / name
    description_file = directory / "environment.json"
    if not description_file.exists():
        raise SystemExit(f"Start the environment first: serve-environment.mjs start {name} --lang {lang}")
    description = json.loads(description_file.read_text())
    return Environment(api_url=description["apiUrl"], web_url=description["webUrl"], directory=directory)
