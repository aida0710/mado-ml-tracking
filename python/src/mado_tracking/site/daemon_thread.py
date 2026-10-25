"""daemonスレッドで動くブロッキングな呼び出しをawaitする。

asyncio.to_threadはループのexecutorを使い、インタープリタは終了時にそのスレッドを待つ。
スケジューラに止められたrunnerは、ダウンロードがブロックしたままでも終われる必要がある。
"""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable
from typing import Any, TypeVar

Result = TypeVar("Result")


def _set_result(future: asyncio.Future[Result], result: Result) -> None:
    if not future.done():
        future.set_result(result)


def _set_exception(future: asyncio.Future[Any], error: BaseException) -> None:
    if not future.done():
        future.set_exception(error)


async def run_in_daemon_thread(function: Callable[[], Result], *, name: str = "mmt-runner") -> Result:
    loop = asyncio.get_running_loop()
    future: asyncio.Future[Result] = loop.create_future()

    def target() -> None:
        try:
            result = function()
        except BaseException as error:
            # asyncio.to_threadと同じく、エラーはawaitしているコルーチンに渡す。
            outcome: tuple[Callable[..., None], Any] = (_set_exception, error)
        else:
            outcome = (_set_result, result)
        try:
            loop.call_soon_threadsafe(outcome[0], future, outcome[1])
        except RuntimeError:
            # このスレッドが動いている間にループが閉じた。もう誰も結果を待っていない。
            pass

    threading.Thread(target=target, name=name, daemon=True).start()
    return await future
