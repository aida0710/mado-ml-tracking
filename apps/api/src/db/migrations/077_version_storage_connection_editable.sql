-- ストレージ接続のIDは、あとから付けたり直したりできる。mado S3 Data Catalogへ接続する前に登録した
-- バージョンにはIDが無く、接続を作り直すとIDが変わるため。IDはリンクの行き先を決めるだけで、
-- バージョンの中身（URI・digestなど）ではないので、この列だけを変える更新は不変の対象から外す。
-- ほかの列を変える更新と、何も変えない更新は、今までどおり断る。
DROP TRIGGER dataset_versions_immutable ON dataset_versions;
CREATE TRIGGER dataset_versions_immutable BEFORE UPDATE ON dataset_versions FOR EACH ROW
  WHEN (
    (to_jsonb(OLD) - 'data_catalog_storage_connection_id')
      IS DISTINCT FROM (to_jsonb(NEW) - 'data_catalog_storage_connection_id')
    OR OLD.data_catalog_storage_connection_id IS NOT DISTINCT FROM NEW.data_catalog_storage_connection_id
  )
  EXECUTE FUNCTION reject_version_update();
DROP TRIGGER model_versions_immutable ON model_versions;
CREATE TRIGGER model_versions_immutable BEFORE UPDATE ON model_versions FOR EACH ROW
  WHEN (
    (to_jsonb(OLD) - 'data_catalog_storage_connection_id')
      IS DISTINCT FROM (to_jsonb(NEW) - 'data_catalog_storage_connection_id')
    OR OLD.data_catalog_storage_connection_id IS NOT DISTINCT FROM NEW.data_catalog_storage_connection_id
  )
  EXECUTE FUNCTION reject_version_update();
