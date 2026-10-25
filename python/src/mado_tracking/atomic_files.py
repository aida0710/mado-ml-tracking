"""一時的な名前で書いてから名前を変え、書き込みに失敗しても書きかけのファイルを残さない。"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import BinaryIO


@contextmanager
def atomic_output(target: Path) -> Iterator[BinaryIO]:
    """ブロックがエラー無しで終わったときだけ``target``を置き換える、シークできるファイルを返す。

    最後の名前の変更が1つのファイルシステムの中で済むよう、一時ファイルは``target``の隣に置く。
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".partial")
    try:
        with os.fdopen(descriptor, "w+b") as output:
            yield output
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)
