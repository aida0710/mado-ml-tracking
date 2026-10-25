"""JobのstdoutとstderrをRunのログに1行ずつ送る。runner自身のメッセージもいっしょに送る。

CommandExecutionは各コマンド（イメージのpull、git、コンテナ）の伏せ字済みの出力を、
workspaceのstdout.logとstderr.logに書く。forwarderは両方を、最後に送ったバイトから追う。
復帰文字はターミナルと同じく行を最初から書き直すので、進捗バーは最後の状態だけが残る。
"""

from __future__ import annotations

import codecs
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..errors import ApiError, LeaseRejected
from ..security import SecretMasker
from ..timestamps import utc_timestamp

LOGGER = logging.getLogger(__name__)
# APIのログのバッチの上限。
MAX_ENTRIES_PER_REQUEST = 1000
# これより長い行や、いつまでも行を終えない進捗バーは、この大きさに分けて送る。
MAX_LINE_CHARACTERS = 16 * 1024
READ_CHUNK_BYTES = 1024 * 1024
# APIにつながらない間は、これを超えた分を古い行から捨てる。
MAX_PENDING_ENTRIES = 20_000
STREAM_LEVELS = {"stdout": "info", "stderr": "error"}

LogSender = Callable[[list[dict[str, Any]]], Awaitable[None]]


@dataclass
class _Stream:
    level: str
    offset: int = 0
    buffer: str = ""
    decoder: Any = field(default_factory=lambda: codecs.getincrementaldecoder("utf-8")("replace"))


def terminal_line(line: str) -> str:
    """ターミナルがその行として表示するもの。最後の復帰文字のあとの文字列。"""
    return line.rstrip("\r").rsplit("\r", 1)[-1]


class LogForwarder:
    def __init__(self, workspace: Path, *, send: LogSender, masker: SecretMasker):
        self.workspace = workspace
        self.send = send
        self.masker = masker
        self.streams = {name: _Stream(level) for name, level in STREAM_LEVELS.items()}
        self.pending: list[dict[str, Any]] = []
        self.dropped = 0

    def add(self, level: str, message: str) -> None:
        """runner自身のメッセージを1つ積む。次のforward()で送られる。"""
        self._append(level, message)

    def _append(self, level: str, message: str) -> None:
        # 分割する前に伏せるので、秘密が2つの部分にまたがって伏せられずに残ることは無い。
        masked = self.masker.mask(message)
        for start in range(0, len(masked), MAX_LINE_CHARACTERS):
            part = masked[start : start + MAX_LINE_CHARACTERS]
            self.pending.append({"timestamp": utc_timestamp(), "level": level, "message": part})
        if len(self.pending) > MAX_PENDING_ENTRIES:
            excess = len(self.pending) - MAX_PENDING_ENTRIES
            self.dropped += excess
            del self.pending[:excess]

    def _read(self, name: str, *, final: bool) -> None:
        stream = self.streams[name]
        path = self.workspace / f"{name}.log"
        while path.exists():
            with path.open("rb") as content:
                content.seek(stream.offset)
                raw = content.read(READ_CHUNK_BYTES)
            stream.offset += len(raw)
            stream.buffer += stream.decoder.decode(raw)
            self._emit_lines(stream)
            if not final or not raw:
                break
        if final:
            stream.buffer += stream.decoder.decode(b"", final=True)
            if terminal_line(stream.buffer):
                self._append(stream.level, terminal_line(stream.buffer))
            stream.buffer = ""

    def _emit_lines(self, stream: _Stream) -> None:
        *lines, stream.buffer = stream.buffer.split("\n")
        for line in lines:
            shown = terminal_line(line)
            if shown:
                self._append(stream.level, shown)
        if len(stream.buffer) > MAX_LINE_CHARACTERS:
            stream.buffer = terminal_line(stream.buffer)
            while len(stream.buffer) > MAX_LINE_CHARACTERS:
                self._append(stream.level, stream.buffer[:MAX_LINE_CHARACTERS])
                stream.buffer = stream.buffer[MAX_LINE_CHARACTERS:]

    async def forward(self, *, final: bool = False) -> None:
        """ここまでに書かれたものをすべて送る。`final`なら、終わっていない最後の行も送る。"""
        for name in self.streams:
            self._read(name, final=final)
        if self.dropped:
            dropped, self.dropped = self.dropped, 0
            self.pending.insert(
                0,
                {
                    "timestamp": utc_timestamp(),
                    "level": "warning",
                    "message": f"{dropped} log lines were dropped while the API was unreachable",
                },
            )
        while self.pending:
            batch = self.pending[:MAX_ENTRIES_PER_REQUEST]
            try:
                await self.send(batch)
            except LeaseRejected:
                raise
            except ApiError as error:
                if (
                    error.status_code is not None
                    and 400 <= error.status_code < 500
                    and error.status_code not in {408, 429}
                ):
                    # APIはこのバッチを今後も拒む。残しておくと、あとのすべての行が詰まってしまう。
                    LOGGER.warning("Run log batch refused: %s", self.masker.mask(str(error)))
                    del self.pending[: len(batch)]
                    continue
                LOGGER.warning("Run log delivery deferred: %s", self.masker.mask(str(error)))
                return
            del self.pending[: len(batch)]
