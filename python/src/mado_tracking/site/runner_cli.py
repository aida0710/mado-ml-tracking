"""`mado-tracking site-run <spec dir>`は、siteのjob shellが計算ノードで起動するrunner。"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any

from .runner import run_site_runner


def add_parser(commands: Any) -> None:
    parser = commands.add_parser(
        "site-run",
        help="run one site Job on this compute node (what the job shell's MMT_RUNNER starts)",
        description=(
            "Run jobs/<MMT_ARRAY_INDEX>.json of the spec directory: report to the API with the Job "
            "token, stage the inputs, run the container and save its outputs."
        ),
    )
    parser.add_argument("spec_directory", metavar="SPEC_DIR", type=Path)
    parser.set_defaults(handler=run)


def run(arguments: argparse.Namespace) -> int:
    # スケジューラは、runnerのstderrをジョブの出力ファイルに残す。
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return run_site_runner(arguments.spec_directory)
