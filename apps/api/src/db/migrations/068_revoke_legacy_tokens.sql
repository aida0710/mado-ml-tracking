-- Tokens in two forms that the application no longer reads are revoked; their owners issue new ones.
-- A person-owned service token predates Service Accounts, and a token without a stored prefix
-- predates prefixes, so neither can be shown nor told apart in token lists. Revoked rows stay: the
-- audit log and other history reference them.
WITH revoked AS (
  UPDATE api_tokens t SET revoked_at = now()
  FROM users o
  WHERE o.id = t.user_id AND t.revoked_at IS NULL
    AND ((t.kind = 'service' AND o.kind = 'human') OR t.token_prefix IS NULL)
  RETURNING t.id, t.project_id, t.user_id, t.name, t.kind, t.token_prefix IS NULL AS prefix_missing
)
INSERT INTO audit_events(actor_type, action, outcome, resource_type, resource_id, project_id, details)
SELECT 'system', 'token.revoke', 'success', 'api_token', id::text, project_id,
  jsonb_build_object(
    'reason', CASE WHEN prefix_missing THEN 'prefix_missing' ELSE 'person_owned_service_token' END,
    'ownerType', 'user', 'ownerUserId', user_id, 'name', name, 'kind', kind)
FROM revoked;

-- Every live token has a prefix from now on.
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_live_prefix
  CHECK (token_prefix IS NOT NULL OR revoked_at IS NOT NULL);
