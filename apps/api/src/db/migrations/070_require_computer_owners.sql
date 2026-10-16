-- A successful creation audit establishes the owner; merely having used a computer does not.
UPDATE compute_targets t SET owner_user_id = a.owner_id
FROM (
  SELECT resource_id, min(actor_user_id::text)::uuid AS owner_id FROM audit_events
  WHERE action = 'compute_target.create' AND outcome = 'success' AND actor_user_id IS NOT NULL
  GROUP BY resource_id HAVING count(DISTINCT actor_user_id) = 1
) a WHERE t.owner_user_id IS NULL AND a.resource_id = t.id::text;

-- A computer whose owner still cannot be established, or a site without the settings its submission
-- mode needs, takes an operator's decision. Stop rather than guess an owner or delete its jobs; every
-- pending migration runs in one transaction, so nothing is applied.
DO $$
DECLARE
  ownerless bigint;
  incomplete_sites bigint;
BEGIN
  SELECT count(*) INTO ownerless FROM compute_targets WHERE owner_user_id IS NULL;
  SELECT count(*) INTO incomplete_sites FROM compute_targets t LEFT JOIN site_settings s ON s.target_id = t.id
  WHERE t.executor = 'site' AND (
    s.target_id IS NULL
    OR (t.submission_mode = 'automatic' AND (s.launcher_id IS NULL OR s.connection_host IS NULL
      OR btrim(s.known_hosts) = '' OR (s.account_mode = 'shared' AND btrim(s.shared_account) = '')
      OR (s.account_mode = 'personal' AND s.shared_account <> '')))
    OR (t.submission_mode = 'manual' AND (s.launcher_id IS NOT NULL OR s.connection_host IS NOT NULL
      OR s.shared_account <> '' OR s.account_mode <> 'personal'))
    OR (s.account_mode = 'shared' AND btrim(s.work_directory) = '')
    OR (s.gpu_assignment = 'scheduler' AND cardinality(s.lease_gpu_ids) > 0)
  );
  IF ownerless > 0 OR incomplete_sites > 0 THEN
    RAISE EXCEPTION 'migration 070 needs an operator decision: % computers without an owner, % sites with incomplete settings',
      ownerless, incomplete_sites
      USING HINT = 'With the previous release, set compute_targets.owner_user_id and complete or remove those sites, then migrate again.';
  END IF;
END $$;

ALTER TABLE compute_targets ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN visibility DROP DEFAULT, DROP CONSTRAINT target_private_owner;
