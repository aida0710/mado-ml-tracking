-- Bridge URLs cannot identify a Mado instance, and an unpinned event cannot establish its
-- destination or delivery history. Discard these connections/events instead of guessing either.
CREATE TEMP TABLE removed_plugin_connections ON COMMIT DROP AS
  SELECT id FROM plugin_connections WHERE kind = 'legacy' OR migration_pending OR config IS NULL;
-- Keep the DatasetVersion's URI, digest and provenance; a removed connection is no longer a
-- usable external identity. Only this migration may update that part of an immutable version.
ALTER TABLE dataset_versions DISABLE TRIGGER dataset_versions_immutable;
UPDATE dataset_versions SET external_ref = NULL
WHERE lower(external_ref->>'pluginId') IN (SELECT id::text FROM removed_plugin_connections);
ALTER TABLE dataset_versions ENABLE TRIGGER dataset_versions_immutable;
DELETE FROM plugin_outbox WHERE plugin_id IN (SELECT id FROM removed_plugin_connections)
  OR payload IS NULL OR payload_hash IS NULL OR destination_url IS NULL OR config_revision IS NULL;
DELETE FROM plugin_connections WHERE id IN (SELECT id FROM removed_plugin_connections);
-- 067 marked per-purpose credentials as unconfigured. They cannot be combined into an access
-- token, so erase their ciphertext and grant; a configured access token remains unchanged.
UPDATE plugin_connections SET encrypted_credentials = NULL, secret_key_id = NULL,
  access_token_grant = NULL, credentials_configured = '{"accessToken":false}'::jsonb,
  enabled = false
WHERE encrypted_credentials IS NOT NULL
  AND credentials_configured->>'accessToken' IS DISTINCT FROM 'true';
ALTER TABLE plugin_connections
  DROP COLUMN base_url, DROP COLUMN token_env, DROP COLUMN migration_pending,
  ALTER COLUMN kind DROP DEFAULT, ALTER COLUMN config SET NOT NULL,
  DROP CONSTRAINT plugin_connections_kind_check,
  ADD CONSTRAINT plugin_connections_kind_check CHECK (kind = 'mado');
ALTER TABLE plugin_outbox
  ALTER COLUMN payload SET NOT NULL, ALTER COLUMN payload_hash SET NOT NULL,
  ALTER COLUMN destination_url SET NOT NULL, ALTER COLUMN config_revision SET NOT NULL;
CREATE OR REPLACE FUNCTION protect_plugin_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.plugin_id IS DISTINCT FROM NEW.plugin_id OR OLD.event_id IS DISTINCT FROM NEW.event_id
      OR OLD.event IS DISTINCT FROM NEW.event THEN
    RAISE EXCEPTION 'Plugin event identity is immutable';
  END IF;
  IF OLD.payload IS DISTINCT FROM NEW.payload OR OLD.payload_hash IS DISTINCT FROM NEW.payload_hash
      OR OLD.destination_url IS DISTINCT FROM NEW.destination_url
      OR OLD.config_revision IS DISTINCT FROM NEW.config_revision THEN
    RAISE EXCEPTION 'Plugin delivery snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- No host facts were measured in version 1; preserve the measured facts and explicitly mark
-- the unknown host fields, without inventing Python or directory candidates.
UPDATE target_checks SET result = result || jsonb_build_object(
  'version', 2,
  'host', jsonb_build_object('machine', NULL, 'cpuArch', NULL, 'cpuCount', NULL,
    'memoryTotalBytes', NULL, 'homeDirectory', NULL),
  'pythons', '[]'::jsonb, 'directories', '[]'::jsonb
) WHERE kind = 'connection' AND result->>'version' = '1';
ALTER TABLE target_checks ADD CONSTRAINT target_checks_result_version
  CHECK (kind <> 'connection' OR result IS NULL OR (result->>'version' = '2') IS TRUE);

-- Preserve the previous interpretation of a stored S3 setting as an explicit boolean.
UPDATE storage_backends SET config = config || '{"multipartEnabled":true}'::jsonb
WHERE kind = 's3' AND NOT (config ? 'multipartEnabled');
ALTER TABLE storage_backends ADD CONSTRAINT storage_backends_multipart_required
  CHECK (kind <> 's3' OR (jsonb_typeof(config->'multipartEnabled') = 'boolean') IS TRUE);

-- The observation time must not be reset to migration time and hide an already stalled Job.
UPDATE jobs SET heartbeat_at = COALESCE(started_at, created_at)
WHERE status IN ('claimed','running') AND heartbeat_at IS NULL;
ALTER TABLE jobs ADD CONSTRAINT jobs_active_heartbeat
  CHECK (status NOT IN ('claimed','running') OR heartbeat_at IS NOT NULL);

-- An incomplete presence cannot establish which host or capacity is running a Job. End its
-- leases before discarding it; fresh claim/resume requests register the complete description.
CREATE TEMP TABLE incomplete_workers ON COMMIT DROP AS
  SELECT token_id, worker_id FROM workers
  WHERE version IS NULL OR hostname IS NULL OR parallel_jobs IS NULL OR ssh_files IS NULL;
CREATE TEMP TABLE incomplete_worker_jobs ON COMMIT DROP AS
  SELECT j.id, j.run_id FROM jobs j JOIN incomplete_workers w
    ON w.token_id = j.worker_token_id AND w.worker_id = j.worker_id
  WHERE j.status IN ('claimed','running');
UPDATE runs SET status = 'failed', ended_at = now(), error = 'Worker presence is incomplete; lease revoked'
WHERE id IN (SELECT run_id FROM incomplete_worker_jobs) AND status IN ('queued','running');
UPDATE jobs SET status = 'failed', ended_at = now(), cancel_requested = true,
  error = 'Worker presence is incomplete; lease revoked'
WHERE id IN (SELECT id FROM incomplete_worker_jobs);
UPDATE job_tokens SET revoked_at = now()
WHERE job_id IN (SELECT id FROM incomplete_worker_jobs) AND revoked_at IS NULL;
-- Reservations stay until process termination is established; this migration does not contact hosts.
DELETE FROM workers w USING incomplete_workers i
WHERE w.token_id = i.token_id AND w.worker_id = i.worker_id;
ALTER TABLE workers ALTER COLUMN version SET NOT NULL, ALTER COLUMN hostname SET NOT NULL, ALTER COLUMN parallel_jobs SET NOT NULL,
  ALTER COLUMN ssh_files SET NOT NULL, ALTER COLUMN capabilities DROP DEFAULT;

-- Only seed history identifies a Demo. A user-created Project with the same name is untouched.
UPDATE projects p SET name = 'mado ML Tracking Demo'
FROM demo_seed_history h
WHERE h.project_id = p.id AND h.name = 'Mado Model Tracking Demo'
  AND p.name = 'Mado Model Tracking Demo';
-- If both seeds exist, retain both Projects and keep the current seed as the idempotency marker.
DELETE FROM demo_seed_history WHERE name = 'Mado Model Tracking Demo'
  AND EXISTS (SELECT 1 FROM demo_seed_history WHERE name = 'mado ML Tracking Demo');
UPDATE demo_seed_history SET name = 'mado ML Tracking Demo' WHERE name = 'Mado Model Tracking Demo';

DROP TRIGGER model_automation_rules_default_owner ON model_automation_rules;
DROP FUNCTION default_automation_rule_owner();
