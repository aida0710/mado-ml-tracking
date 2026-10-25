-- API token の前置きを mado_mt_、Job token の前置きを mado_mtj_ にする（mado S3 Data Catalog の
-- mado_dc_ とそろえる）。認証はこの前置きの値しか受け付けないので、それより前に発行した token は
-- ここで失効させ、持ち主が発行し直す。行は監査ログなどが参照するので残す。
WITH revoked AS (
  UPDATE api_tokens t SET revoked_at = now()
  FROM users o
  WHERE o.id = t.user_id AND t.revoked_at IS NULL
  RETURNING t.id, t.project_id, t.user_id, t.name, t.kind,
    CASE WHEN o.kind = 'service' THEN 'service_account' ELSE 'user' END AS owner_type
)
INSERT INTO audit_events(actor_type, action, outcome, resource_type, resource_id, project_id, details)
SELECT 'system', 'token.revoke', 'success', 'api_token', id::text, project_id,
  jsonb_build_object(
    'reason', 'token_prefix_changed',
    'ownerType', owner_type, 'ownerUserId', user_id, 'name', name, 'kind', kind)
FROM revoked;

-- Job token は Job の lease の間だけ使う値なので、監査には残さず失効だけさせる。
UPDATE job_tokens SET revoked_at = now() WHERE revoked_at IS NULL;

-- 一覧に出す先頭は、前置きと乱数8文字。失効した token は発行したときの先頭のまま残る。
ALTER TABLE api_tokens DROP CONSTRAINT api_tokens_token_prefix_check;
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_token_prefix_format
  CHECK (revoked_at IS NOT NULL OR token_prefix ~ '^mado_mt_[A-Za-z0-9_-]{8}$');
