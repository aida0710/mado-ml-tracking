-- Imported model versions remain immutable; provenance is a separate, append-only record.
CREATE TABLE model_version_training_sources (
  model_version_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  run_id uuid NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY IMMEDIATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(model_version_id,project_id) REFERENCES model_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX model_training_sources_run ON model_version_training_sources(project_id,run_id);

CREATE FUNCTION prevent_training_source_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Model training sources are append-only';
END;
$$;
CREATE TRIGGER immutable_model_training_sources
BEFORE UPDATE ON model_version_training_sources
FOR EACH ROW EXECUTE FUNCTION prevent_training_source_change();

CREATE TRIGGER model_version_training_sources_kept BEFORE DELETE ON model_version_training_sources
FOR EACH ROW EXECUTE FUNCTION reject_delete_outside_project_purge();
