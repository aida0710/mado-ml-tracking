"""コンピュータ側にruntimeのツールが無いことを、実行が始まったふりをせずに報告する。"""

from __future__ import annotations

import shutil

from .container_layout import host_environment


class RuntimeUnavailable(RuntimeError):
    def __init__(self, kind: str, reason: str):
        super().__init__(f"Runtime {kind} is unavailable on the compute target: {reason}")
        self.kind = kind


class ContainerStateUncertain(RuntimeError):
    """daemonでの所有や資源の解放を証明できない。Jobのleaseを持ち続ける。"""


def runtime_binary(kind: str) -> str:
    binary = shutil.which(kind, path=host_environment().get("PATH", ""))
    if binary is None:
        raise RuntimeUnavailable(kind, "CLI executable was not found")
    return binary
