-- A computer is added in two steps (docs/api-contract.md「targetの接続確認」): its connection,
-- saved disabled and checked by a worker the person chooses, then what the check found. A check can
-- name its worker, and the same requests also read one directory of the computer while its paths
-- are filled in.

ALTER TABLE target_checks
  ADD COLUMN kind text NOT NULL DEFAULT 'connection' CHECK (kind IN ('connection','directory_listing')),
  -- The directory a listing reads, as requested (absolute or under ~).
  ADD COLUMN directory_path text CHECK (char_length(directory_path) BETWEEN 1 AND 1024),
  -- The worker (its token and MMT_WORKER_ID) the requester chose; only it claims the request.
  ADD COLUMN assigned_token_id uuid REFERENCES api_tokens(id) ON DELETE CASCADE,
  ADD COLUMN assigned_worker_id text CHECK (char_length(assigned_worker_id) BETWEEN 1 AND 200),
  ADD CONSTRAINT target_check_assignment
    CHECK ((assigned_token_id IS NULL) = (assigned_worker_id IS NULL)),
  -- A listing is always someone's chosen worker's, and only a listing has a directory.
  ADD CONSTRAINT target_check_listing
    CHECK ((kind = 'directory_listing') = (directory_path IS NOT NULL)
      AND (kind = 'connection' OR assigned_token_id IS NOT NULL));

-- One connection check in progress per computer, so repeated clicks cannot pile up SSH sessions.
-- Listings are bounded per computer by the API instead (MAX_OPEN_DIRECTORY_LISTINGS).
DROP INDEX target_checks_one_open;
CREATE UNIQUE INDEX target_checks_one_open ON target_checks(target_id)
  WHERE status IN ('queued','claimed') AND kind = 'connection';
-- Serves a worker's claim of the requests assigned to it, and lookups through the foreign key into
-- api_tokens (migration 056).
CREATE INDEX target_checks_assigned_worker ON target_checks(assigned_token_id,assigned_worker_id);

-- The SSH files a worker found on its host ({keyPaths,knownHostsPaths}); null for a worker that
-- does not report them, which also does not claim requests assigned to it.
ALTER TABLE workers ADD COLUMN ssh_files jsonb;

-- An ssh or local computer may wait disabled for its work directory and Python while it is set
-- up; an enabled one takes Jobs and needs both.
ALTER TABLE compute_targets ADD CONSTRAINT target_enabled_setup CHECK (
  executor = 'site' OR NOT enabled OR (work_directory <> '' AND python_executable <> '')
);
