"""workerがコンピュータに入れるruntimeのバンドルは、mado_trackingのパッケージなしで動く。"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

from mado_tracking.worker.runtime import build_runtime_bundle

# バンドルしたモジュールをすべてimportする。コンピュータにあるのはPythonだけで、workerの環境は無い。
IMPORT_PROBE = """
import importlib, json, sys
bundle, modules = sys.argv[1], json.loads(sys.argv[2])
sys.path.insert(0, bundle)
for module in modules:
    importlib.import_module(f"runtime.{module}")
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
    # -Sでsite-packagesをsys.pathから外し、標準ライブラリとバンドルのほかは何もimportできない
    # コンピュータと同じにする。
    completed = subprocess.run(
        [sys.executable, "-I", "-S", "-c", IMPORT_PROBE, str(tmp_path), json.dumps(modules)],
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
