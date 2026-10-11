-- Workflow versions pin Task snapshots; executions refer to ordinary Runs and Jobs.
CREATE TABLE workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) DEFERRABLE,
  name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  latest_revision integer NOT NULL DEFAULT 1 CHECK(latest_revision > 0),
  created_by uuid NOT NULL REFERENCES users(id) DEFERRABLE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id)
);
CREATE INDEX workflows_project_created ON workflows(project_id,created_at DESC,id DESC);

CREATE TABLE workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  steps jsonb NOT NULL CHECK(jsonb_array_length(steps) BETWEEN 1 AND 10),
  created_by uuid NOT NULL REFERENCES users(id) DEFERRABLE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_id,revision),
  UNIQUE(id,project_id),
  FOREIGN KEY(workflow_id,project_id) REFERENCES workflows(id,project_id) DEFERRABLE
);
CREATE FUNCTION reject_workflow_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Workflow versions are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER workflow_version_immutable BEFORE UPDATE ON workflow_versions
  FOR EACH ROW EXECUTE FUNCTION reject_workflow_version_update();

-- Relational references protect inputs pinned inside the version's JSON from deletion.
CREATE TABLE workflow_version_inputs (
  workflow_version_id uuid NOT NULL,
  project_id uuid NOT NULL,
  dataset_version_id uuid NOT NULL,
  PRIMARY KEY(workflow_version_id,dataset_version_id),
  FOREIGN KEY(workflow_version_id,project_id) REFERENCES workflow_versions(id,project_id) DEFERRABLE,
  FOREIGN KEY(dataset_version_id,project_id) REFERENCES dataset_versions(id,project_id) DEFERRABLE
);
CREATE INDEX workflow_version_inputs_dataset ON workflow_version_inputs(dataset_version_id);

CREATE TABLE workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  workflow_version_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','canceling','finished','failed','canceled')),
  created_by uuid NOT NULL REFERENCES users(id) DEFERRABLE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error text,
  resume_from_execution_id uuid REFERENCES workflow_executions(id) DEFERRABLE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  UNIQUE(id,project_id),
  UNIQUE(workflow_id,created_by,idempotency_key),
  FOREIGN KEY(workflow_id,project_id) REFERENCES workflows(id,project_id) DEFERRABLE,
  FOREIGN KEY(workflow_version_id,project_id) REFERENCES workflow_versions(id,project_id) DEFERRABLE,
  CHECK((status IN ('running','canceling')) = (ended_at IS NULL))
);
CREATE INDEX workflow_executions_history ON workflow_executions(workflow_id,created_at DESC,id DESC);
CREATE INDEX workflow_executions_running ON workflow_executions(created_at,id) WHERE status IN ('running','canceling');

CREATE TABLE workflow_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL,
  project_id uuid NOT NULL,
  step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 9),
  step_key text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','running','finished','failed','canceled')),
  run_id uuid,
  job_id uuid REFERENCES jobs(id) DEFERRABLE,
  reused boolean NOT NULL DEFAULT false,
  dataset_usage jsonb NOT NULL DEFAULT '[]',
  output_dataset_version_ids uuid[] NOT NULL DEFAULT '{}',
  output_model_version_ids uuid[] NOT NULL DEFAULT '{}',
  metrics jsonb NOT NULL DEFAULT '{}',
  error text,
  ended_at timestamptz,
  UNIQUE(execution_id,step_index),
  FOREIGN KEY(execution_id,project_id) REFERENCES workflow_executions(id,project_id) DEFERRABLE,
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) DEFERRABLE
);
CREATE UNIQUE INDEX workflow_step_runs_origin ON workflow_step_runs(run_id) WHERE NOT reused;
CREATE INDEX workflow_step_runs_run ON workflow_step_runs(run_id);
CREATE FUNCTION reject_workflow_step_identity_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.execution_id IS DISTINCT FROM NEW.execution_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.step_index IS DISTINCT FROM NEW.step_index
    OR OLD.step_key IS DISTINCT FROM NEW.step_key
    OR OLD.reused IS DISTINCT FROM NEW.reused
    OR (OLD.run_id IS NOT NULL AND (
      OLD.run_id IS DISTINCT FROM NEW.run_id OR OLD.job_id IS DISTINCT FROM NEW.job_id
      OR OLD.dataset_usage IS DISTINCT FROM NEW.dataset_usage)) THEN
    RAISE EXCEPTION 'Workflow step inputs and Run are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workflow_step_identity_immutable BEFORE UPDATE ON workflow_step_runs
  FOR EACH ROW EXECUTE FUNCTION reject_workflow_step_identity_update();

CREATE TABLE preprocessing_reports (
  run_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  summary jsonb NOT NULL,
  metric_names text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,project_id),
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) DEFERRABLE
);
CREATE TABLE preprocessing_report_samples (
  run_id uuid NOT NULL,
  project_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  PRIMARY KEY(run_id,artifact_id),
  FOREIGN KEY(run_id,project_id) REFERENCES preprocessing_reports(run_id,project_id) DEFERRABLE,
  FOREIGN KEY(artifact_id,project_id) REFERENCES artifacts(id,project_id) DEFERRABLE
);
CREATE INDEX preprocessing_report_samples_artifact ON preprocessing_report_samples(artifact_id);

-- A report cannot add a new reference while an Artifact is being deleted.
CREATE FUNCTION require_live_preprocessing_sample() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM artifacts WHERE id=NEW.artifact_id AND project_id=NEW.project_id
    AND deleted_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preprocessing sample Artifact is unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preprocessing_sample_live BEFORE INSERT ON preprocessing_report_samples
  FOR EACH ROW EXECUTE FUNCTION require_live_preprocessing_sample();

-- Frozen Tasks may no longer be the Task's current revision when a later step starts.
CREATE OR REPLACE FUNCTION guard_run_output_model_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.output_model_registration IS DISTINCT FROM OLD.output_model_registration THEN
      RAISE EXCEPTION 'Run output model registration is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  NEW.output_model_registration=NULL;
  IF NEW.task_id IS NULL OR NEW.execution_mode<>'run' THEN RETURN NEW; END IF;
  IF NEW.environment ? 'workflow' THEN
    SELECT NULLIF(step->'task'->'outputModel','null'::jsonb) INTO NEW.output_model_registration
    FROM workflow_versions version, jsonb_array_elements(version.steps) AS step
    WHERE version.id::text=NEW.environment #>> '{workflow,workflowVersionId}'
      AND version.project_id=NEW.project_id
      AND step->>'key'=NEW.environment #>> '{workflow,stepKey}'
      AND step->'task'->>'id'=NEW.task_id::text
      AND step->'task'->>'revision'=NEW.task_revision::text;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;
  SELECT parent.output_model_registration INTO NEW.output_model_registration FROM runs parent
    WHERE parent.id=NEW.parent_run_id AND parent.project_id=NEW.project_id
      AND parent.task_id=NEW.task_id AND parent.task_revision=NEW.task_revision;
  IF FOUND THEN RETURN NEW; END IF;
  SELECT task.output_model INTO NEW.output_model_registration FROM experiment_tasks task
    WHERE task.id=NEW.task_id AND task.project_id=NEW.project_id AND task.revision=NEW.task_revision;
  RETURN NEW;
END;
$$;

CREATE FUNCTION reject_workflow_run_settings_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.environment ? 'workflow' AND (
    OLD.parameters IS DISTINCT FROM NEW.parameters
    OR OLD.environment->'workflow' IS DISTINCT FROM NEW.environment->'workflow'
    OR OLD.environment->'datasetUsage' IS DISTINCT FROM NEW.environment->'datasetUsage') THEN
    RAISE EXCEPTION 'Workflow Run settings are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workflow_run_settings_immutable BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION reject_workflow_run_settings_update();
