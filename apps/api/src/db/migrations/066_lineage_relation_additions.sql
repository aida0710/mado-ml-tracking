-- Supplement proven history without rewriting the original Run or immutable version.
CREATE TABLE lineage_relation_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  source_id uuid NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN ('run','modelVersion','datasetVersion')),
  target_id uuid NOT NULL,
  target_kind text NOT NULL CHECK(target_kind IN ('run','modelVersion','datasetVersion')),
  relation text NOT NULL CHECK(relation IN ('input','output','model','parentRun','reference')),
  reason text NOT NULL,
  evidence jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_run_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='run' THEN source_id END) STORED,
  source_model_version_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='modelVersion' THEN source_id END) STORED,
  source_dataset_version_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='datasetVersion' THEN source_id END) STORED,
  target_run_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='run' THEN target_id END) STORED,
  target_model_version_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='modelVersion' THEN target_id END) STORED,
  target_dataset_version_id uuid GENERATED ALWAYS AS (CASE WHEN target_kind='datasetVersion' THEN target_id END) STORED,
  FOREIGN KEY(source_run_id,project_id) REFERENCES runs(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(source_model_version_id,project_id) REFERENCES model_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(source_dataset_version_id,project_id) REFERENCES dataset_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(target_run_id,project_id) REFERENCES runs(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(target_model_version_id,project_id) REFERENCES model_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(target_dataset_version_id,project_id) REFERENCES dataset_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE(project_id,source_id,target_id,relation),
  CHECK(source_id <> target_id),
  CHECK(relation='reference'
    OR (relation='input' AND source_kind='datasetVersion' AND target_kind='run')
    OR (relation='output' AND source_kind='run' AND target_kind='datasetVersion')
    OR (relation='model' AND source_kind='modelVersion' AND target_kind='run')
    OR (relation='parentRun' AND source_kind='run' AND target_kind='run'))
);
CREATE INDEX lineage_relation_additions_source ON lineage_relation_additions(project_id,source_id);
CREATE INDEX lineage_relation_additions_target ON lineage_relation_additions(project_id,target_id);
-- Purging an endpoint must find its references without scanning every historical relation.
CREATE INDEX lineage_relation_source_run ON lineage_relation_additions(project_id,source_run_id);
CREATE INDEX lineage_relation_source_model ON lineage_relation_additions(project_id,source_model_version_id);
CREATE INDEX lineage_relation_source_dataset ON lineage_relation_additions(project_id,source_dataset_version_id);
CREATE INDEX lineage_relation_target_run ON lineage_relation_additions(project_id,target_run_id);
CREATE INDEX lineage_relation_target_model ON lineage_relation_additions(project_id,target_model_version_id);
CREATE INDEX lineage_relation_target_dataset ON lineage_relation_additions(project_id,target_dataset_version_id);
CREATE UNIQUE INDEX lineage_relation_additions_output ON lineage_relation_additions(target_id) WHERE relation='output';
CREATE FUNCTION prevent_lineage_relation_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical lineage additions are append-only';
END;
$$;
CREATE TRIGGER immutable_lineage_relations BEFORE UPDATE ON lineage_relation_additions
FOR EACH ROW EXECUTE FUNCTION prevent_lineage_relation_change();
CREATE TRIGGER lineage_relations_kept BEFORE DELETE ON lineage_relation_additions
FOR EACH ROW EXECUTE FUNCTION reject_delete_outside_project_purge();
