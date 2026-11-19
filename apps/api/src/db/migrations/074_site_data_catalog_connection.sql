-- mado S3 Data Catalogへの接続を、Projectごとの設定から全体で1つの設定に変える。
-- 使い道は容量の表示だけで、Projectごとに分ける理由が無い。URLは画面のものを1つだけ持つ
-- （APIは同じURLの下にある）。行があるのは、接続を確かめられたときだけ。
CREATE TABLE data_catalog_connection (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  url text NOT NULL,
  secret_key_id text NOT NULL,
  encrypted_access_token bytea NOT NULL,
  access_token_grant jsonb NOT NULL,
  checked_at timestamptz NOT NULL
);

-- Projectごとの接続（plugin_connections）は、この版から読まない。どのProjectの接続を全体の
-- 設定にするかは決められず、access tokenの暗号文は行ごとの文脈に結び付いているので、引き継がない。
-- 全体管理者が接続し直す。使わなくなったaccess tokenを残さないよう、暗号文と確認の結果を消す。
-- 行そのものは、取り込み済みのDatasetVersionの外部参照とplugin_outboxが指しているので残す。
UPDATE plugin_connections SET
  enabled = false,
  secret_key_id = NULL,
  encrypted_credentials = NULL,
  credentials_configured = '{"accessToken":false}'::jsonb,
  access_token_grant = NULL,
  manifest = NULL;
