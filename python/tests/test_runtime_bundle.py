"""workerがコンピュータに入れるruntimeのバンドルは、mado_trackingのパッケージなしで動く。"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

from mado_tracking.worker.runtime import build_runtime_bundle

# バンドルしたモジュールをすべてimportし、バンドルと標準ライブラリ以外から来たトップレベルの
# パッケージを出力する。コンピュータにあるのはPythonだけで、workerの環境は無い。
IMPORT_PROBE = """
import importlib, json, sys
bundle, modules = sys.argv[1], json.loads(sys.argv[2])
already_loaded = set(sys.modules)
sys.path.insert(0, bundle)
for module in modules:
    importlib.import_module(f"runtime.{module}")
foreign = {
    name.split(".")[0]
    for name in set(sys.modules) - already_loaded
    if name.split(".")[0] not in sys.stdlib_module_names and name.split(".")[0] != "runtime"
}
print(json.dumps(sorted(foreign)))
"""


def test_every_runtime_module_imports_from_the_bundle_and_the_standard_library_alone(tmp_path: Path):
    with zipfile.ZipFile(io.BytesIO(build_runtime_bundle())) as archive:
        modules = sorted(
            name.removeprefix("runtime/").removesuffix(".py")
            for name in archive.namelist()
            if name.startswith("runtime/") and name.endswith(".py") and name != "runtime/__init__.py"
        )
        archive.extractall(tmp_path)
    assert "workflow_context" in modules
    completed = subprocess.run(
        [sys.executable, "-I", "-c", IMPORT_PROBE, str(tmp_path), json.dumps(modules)],
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout) == []
