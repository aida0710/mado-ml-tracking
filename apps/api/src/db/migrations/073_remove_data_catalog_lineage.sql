-- mado S3 Data CatalogがDataLineageを外すので、連携に残るのはアクセストークンの確認と容量の
-- 取得だけになる。接続の設定と、前回の接続確認で保存した結果から、DataLineageのための項目を外す。
-- アプリケーションはこれらの列をそのまま応答に載せるので、行を今の形にそろえる。
-- 設定のrevisionは進めない。接続先とアクセストークンは変わらず、確認の結果も有効なまま。
UPDATE plugin_connections SET
  config = config - 'lineageUrl' - 'jobNamespace' - 'storageSystemKey',
  access_token_grant = access_token_grant - 'namespaces',
  manifest = jsonb_set(manifest, '{capabilities}',
    CASE WHEN manifest->'capabilities' ? 'storage:metrics'
      THEN '["storage:metrics"]'::jsonb ELSE '[]'::jsonb END);

-- plugin_outboxは、送ったRunの記録と未送信の行をそのまま残す。この版から行を足す処理も送る処理も
-- 無いので、未送信の行はpendingのまま送られない。行の本文と送信先は変更禁止のトリガー
-- （protect_plugin_delivery_identity）が守っており、ここでも触らない。

-- 送信の滞留はもう見張らない。開いたままのアラートは「対象を見張らなくなった」として閉じる。
-- 閉じたアラートと、この種別を選んだ通知ルールは履歴として残す。
UPDATE operations_alerts SET resolved_at = now(), resolution = 'inactive'
WHERE kind = 'plugin.delivery_stalled' AND resolved_at IS NULL;
