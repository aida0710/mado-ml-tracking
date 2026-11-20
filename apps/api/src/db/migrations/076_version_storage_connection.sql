-- `s3://`のURIがどのストレージ接続のものか。mado S3 Data Catalogの画面のURLを作るのに使う。
-- 実行先がどのS3から読むかは変えない。この版より前のバージョンと、Jobの出力やMLflowが
-- 作るバージョンではNULL。
ALTER TABLE dataset_versions ADD COLUMN data_catalog_storage_connection_id text;
ALTER TABLE model_versions ADD COLUMN data_catalog_storage_connection_id text;
