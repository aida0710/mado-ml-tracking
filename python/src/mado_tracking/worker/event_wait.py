"""終了のイベントか、次のheartbeat・ポーリングの間隔まで待つ。"""

import asyncio


async def wait_interval(event: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(event.wait(), timeout=seconds)
    except TimeoutError:
        pass
