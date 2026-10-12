-- Content identity and the original registration stay fixed when provenance is discovered later.
CREATE TABLE dataset_version_parent_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  dataset_version_id uuid NOT NULL,
  parent_dataset_version_id uuid NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY IMMEDIATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dataset_version_id,parent_dataset_version_id),
  CHECK(dataset_version_id <> parent_dataset_version_id),
  FOREIGN KEY(dataset_version_id,project_id) REFERENCES dataset_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(parent_dataset_version_id,project_id) REFERENCES dataset_versions(id,project_id) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX dataset_parent_additions_project_version ON dataset_version_parent_additions(project_id,dataset_version_id);
CREATE INDEX dataset_parent_additions_parent ON dataset_version_parent_additions(project_id,parent_dataset_version_id);

CREATE FUNCTION prevent_dataset_parent_addition_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Dataset parent additions are append-only';
END;
$$;
CREATE TRIGGER immutable_dataset_parent_additions BEFORE UPDATE ON dataset_version_parent_additions
FOR EACH ROW EXECUTE FUNCTION prevent_dataset_parent_addition_change();
CREATE TRIGGER dataset_parent_additions_kept BEFORE DELETE ON dataset_version_parent_additions
FOR EACH ROW EXECUTE FUNCTION reject_delete_outside_project_purge();
