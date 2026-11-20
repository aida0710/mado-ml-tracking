-- mado S3 Data Catalogのストレージ接続（S3の接続先）を、接続を確かめたときに覚える。
-- 登録のときはこれと照合し、そのたびにmado S3 Data Catalogへ問い合わせない。
ALTER TABLE data_catalog_connection
  ADD COLUMN storage_connections jsonb NOT NULL DEFAULT '[]'::jsonb;
