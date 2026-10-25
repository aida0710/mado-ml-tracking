"""The CPU worker of the sample environment, started by seed_sample_project.py.

The token comes in the environment variable MMT_API_TOKEN and is never written to a file. The
telemetry interval is shorter than the CLI default (10 s) so that the System metrics charts of a
half-minute training Run have enough points. SIGTERM stops it.
"""

import asyncio
import os
import signal
from pathlib import Path

from mado_tracking.settings import ApiSettings
from mado_tracking.worker.config import WorkerSettings
from mado_tracking.worker.service import Worker

# 約30秒の学習Runの間に、system.*の点を十数個記録する間隔。
TELEMETRY_SECONDS = 2.0


async def main() -> None:
    settings = WorkerSettings(
        api=ApiSettings.from_environment(),
        worker_id=os.environ["MMT_WORKER_ID"],
        target_ids=tuple(os.environ["MMT_WORKER_TARGET_IDS"].split(",")),
        state_directory=Path(os.environ["MMT_WORKER_STATE_DIR"]),
        allow_local_executor=True,
        heartbeat_seconds=1.0,
        poll_seconds=0.5,
        telemetry_seconds=TELEMETRY_SECONDS,
        cancel_grace_seconds=5.0,
        parallel_jobs=2,
    )
    worker = Worker(settings)
    loop = asyncio.get_running_loop()
    for signal_number in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signal_number, worker.stopping.set)
    await worker.run_forever()


if __name__ == "__main__":
    asyncio.run(main())
