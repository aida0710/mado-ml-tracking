"""What this package's Job execution passes to a Job's code beyond the base Job protocol.

The values of WORKER_CAPABILITIES in packages/contracts. A worker names them in workerInfo on claim
and resume; a launcher and `mado-tracking submit` name them in their site claims, for the runner
they install on the site, which is this same package. The API gives a Job that needs one only to a
claim that names it.

- workflowDatasetUsage: a Job gets MMT_DATASET_USAGE_FILE and MMT_WORKFLOW_EXECUTION_ID from its
  Run (workflow_context.py), so the API hands it workflow steps.
"""

from __future__ import annotations

WORKER_CAPABILITIES = ("workflowDatasetUsage",)
