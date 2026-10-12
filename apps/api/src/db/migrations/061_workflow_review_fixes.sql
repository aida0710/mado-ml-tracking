-- Fixes to the workflow tables of 060, which databases may already have applied as it is.

-- What a worker named in workerInfo.capabilities on its latest claim or resume. An older worker
-- names nothing, and WorkerService.claim gives it no Job that needs a capability.
ALTER TABLE workers ADD COLUMN capabilities text[] NOT NULL DEFAULT '{}';

-- Indexes on the referencing columns of foreign keys into tables a Project purge deletes from,
-- for the reason given in 056 (each deferred check would otherwise read the whole table).
CREATE INDEX workflow_executions_version ON workflow_executions(workflow_version_id,project_id);
CREATE INDEX workflow_executions_resumed_from ON workflow_executions(resume_from_execution_id);
CREATE INDEX workflow_step_runs_job ON workflow_step_runs(job_id);

-- An execution's workflow and revision are those of the version it runs, so the history of one
-- workflow never lists another workflow's version. The version index above serves this key too.
ALTER TABLE workflow_versions
  ADD CONSTRAINT workflow_versions_identity UNIQUE (id,workflow_id,revision);
ALTER TABLE workflow_executions
  ADD CONSTRAINT workflow_executions_version_identity
  FOREIGN KEY (workflow_version_id,workflow_id,revision)
  REFERENCES workflow_versions(id,workflow_id,revision) DEFERRABLE;

-- Versions use the registry's immutability guard, as other versions do.
DROP TRIGGER workflow_version_immutable ON workflow_versions;
CREATE TRIGGER workflow_version_immutable BEFORE UPDATE ON workflow_versions
  FOR EACH ROW EXECUTE FUNCTION reject_version_update();
DROP FUNCTION reject_workflow_version_update();

-- A version and the dataset versions it pinned are kept as long as their Project: the pinned
-- inputs are what stops those dataset versions from being deleted. Only a purge removes them (055).
CREATE TRIGGER workflow_versions_kept BEFORE DELETE ON workflow_versions
  FOR EACH ROW EXECUTE FUNCTION reject_delete_outside_project_purge();
CREATE TRIGGER workflow_version_inputs_immutable BEFORE UPDATE ON workflow_version_inputs
  FOR EACH ROW EXECUTE FUNCTION reject_version_update();
CREATE TRIGGER workflow_version_inputs_kept BEFORE DELETE ON workflow_version_inputs
  FOR EACH ROW EXECUTE FUNCTION reject_delete_outside_project_purge();
