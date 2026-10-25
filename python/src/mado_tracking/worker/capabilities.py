"""このパッケージのJob実行が、基本のJobプロトコルに加えてJobのコードへ渡すもの。

packages/contractsのWORKER_CAPABILITIESの値。workerはclaimとresumeのときにworkerInfoでこれを
示す。launcherと`mado-tracking submit`は、siteにインストールするrunner（このパッケージそのもの）の
ために、siteのclaimでこれを示す。APIは、ある値を必要とするJobを、その値を示したclaimにだけ渡す。

- workflowDatasetUsage: JobはRunからMMT_DATASET_USAGE_FILEとMMT_WORKFLOW_EXECUTION_IDを受け取る
  （workflow_context.py）。そのためAPIはワークフローのステップを渡す。
"""

from __future__ import annotations

WORKER_CAPABILITIES = ("workflowDatasetUsage",)
