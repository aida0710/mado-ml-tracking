"""コンピュータで固定のPOSIX shスクリプトを実行し、それが出力するトークンを読み取る。

スクリプトはstdinから`sh -s`に渡すので、cshのログインシェルでも同じように動く。
値は位置引数としてだけ渡し、スクリプトの一部にはしない。スクリプトは各トークンのあとに
NULバイトを出力する（`printf '%s\\000'`）ので、空白や改行を含むパスもそのまま届く。
スクリプトは本体を`main`関数に入れ、シェルがそれを全部読んでから、stdinを/dev/nullにして
実行する。そうしないと、stdinを読むコマンドがスクリプトの残りを飲み込んでしまう。
"""

from __future__ import annotations

from collections.abc import Sequence

from .transport import CommandTransport


async def run_posix_script(
    transport: CommandTransport,
    script: str,
    arguments: Sequence[str],
    *,
    timeout: float,  # noqa: ASYNC109 -- 転送の操作1回全体にかける時間。CommandTransport.runと同じ
) -> bytes:
    return await transport.run(["sh", "-s", "--", *arguments], stdin=script.encode(), timeout=timeout)


def terminated_tokens(output: bytes) -> list[bytes]:
    """NULで終わるトークン。最後のNULより後ろは途中で切れたものなので捨てる。"""
    return output.split(b"\0")[:-1]
