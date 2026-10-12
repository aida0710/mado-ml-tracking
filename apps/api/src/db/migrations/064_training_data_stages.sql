-- Changing the training loader does not rewrite the Run's original, pinned configuration.
CREATE TABLE training_data_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  run_id uuid NOT NULL,
  start_step bigint NOT NULL CHECK(start_step >= 0),
  input_dataset_version_ids uuid[] NOT NULL,
  checkpoint_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY IMMEDIATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,start_step),
  FOREIGN KEY(run_id,project_id) REFERENCES runs(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(checkpoint_id,project_id) REFERENCES run_checkpoints(id,project_id) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX training_data_stages_project_run ON training_data_stages(project_id,run_id,start_step);
CREATE INDEX training_data_stages_checkpoint ON training_data_stages(checkpoint_id) WHERE checkpoint_id IS NOT NULL;
CREATE TRIGGER immutable_training_data_stages
BEFORE UPDATE ON training_data_stages
FOR EACH ROW EXECUTE FUNCTION prevent_training_source_change();

CREATE TRIGGER training_data_stages_kept BEFORE DELETE ON training_data_stages
FOR EACH ROW EXECUTE FUNCTION reject_delete_outside_project_purge();
