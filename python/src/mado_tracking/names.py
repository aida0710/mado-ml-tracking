"""APIが保存・比較するときの、実験とモデルの名前。"""

from __future__ import annotations

# APIが名前を保存・比較する前に両端から取り除く文字（zodの.trim()、つまりJavaScriptの
# String.prototype.trim）。空白と行終端文字。Pythonのstr.strip()は端の扱いが違う
# （U+FEFFを残し、U+001C-U+001FとU+0085も取り除く）。
API_TRIMMED_CHARACTERS = (
    "\t\n\v\f\r              "
    "    　﻿"
)


def trim_name(name: str) -> str:
    """APIが両端から落とす空白を除いた``name``。

    名前で探すときは、除いたあとの名前を使う必要がある。そうしないと``"exp "``は``"exp"``として
    作られ、頼まれた名前では二度と見つからない。
    """
    return name.strip(API_TRIMMED_CHARACTERS)
