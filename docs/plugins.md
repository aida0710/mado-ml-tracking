# 内蔵Mado連携

Mado連携は本体に標準搭載され、本体と同時にビルド・更新します。新しいProjectでは未設定・無効です。設定なしでも実験管理を利用でき、Madoへ通信しません。画面では「連携」、内部の型・テーブル・ルートでは既存のPlugin名を使います。

## 設定する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ストレージ用・通知用の鍵とは分け、DBと一緒に安全に保管します。再起動ごとに作り直さないでください。
2. MadoのSettings → Access → Access Tokensで、DataLineageの「読み取り」と「送信」を許可したアクセストークンを発行します。Namespaceには取り込むデータセットのNamespaceとjobNamespaceを許可します。容量も取得する場合はCapacityの「読み取り」と対象の接続も許可します。
3. Projectの「連携」で全体管理者がMadoのAPI URL、Web URL、OpenLineage URL、RunのNamespace、ストレージの識別名とアクセストークンを保存します。Namespaceの一覧は入力しません。3つのURLは異なる入口を使えます。保存後も初期無効です。
4. 「接続を確認」で、Madoの`/api/mado/access-token`からトークンの許可範囲（scope・Namespace・有効期限）を取得して保存し、許可された各Namespaceの参照と、`metrics:read`があれば容量APIを確認します。`lineage:read`・`lineage:write`の無いトークンと、jobNamespaceを許可していないトークンはここで断ります。確認では架空のRunを送信しません。送信は実Runを1件実行して確認します。

検索と取り込みは、その時点でMadoが返す許可範囲を使います。`namespaces`が`["*"]`のトークンではNamespaceを指定せずに1回で検索します。画面に出す許可範囲は、前回の接続確認で保存した値です。

Madoには`/api/mado/access-token`と参照API`/api/mado/lineage/catalog`、`datasets/:id`、`versions/:id`が必要です。前者の無いMadoへの接続確認・検索・取り込みは502 `plugin_mado_access_token_unsupported`で止まります。Mado側の`docs/model-tracking-api.md`を参照してください。Registryへ直接アクセスせず、Madoの認証済みAPIだけを使います。

| 操作 | 権限 |
| --- | --- |
| 接続設定・アクセストークンの保存、有効切替、旧接続の移行 | 全体管理者 |
| 接続確認、検索、取り込み、容量、再送 | Project admin |
| 取り込んだデータセットをMadoで見る | Projectを読める利用者 |

アクセストークンはAES-256-GCMで暗号化保存し、画面やAPIには設定の有無だけを返します。編集時に入力を空にすると保存済みのトークンを維持します。保存用の鍵を失った場合、旧値を復号できません。保存用の鍵を復旧するか、アクセストークンを再入力して保存します。

migration 067より前に保存した用途別キー（readToken・lineageToken・metricsToken）は使いません。067は暗号文を消さずに`credentials_configured`を未設定に戻し、`config.namespaces`と確認結果を外します。管理者がアクセストークンを入れ直して接続を確認します。

## データセットとRun

検索結果から固定バージョンを選ぶと、APIがそのIDをMadoから再取得してNamespace・URI・digestを検証します。同じバージョンを同時に取り込んでも同じDatasetVersionを返します。既存バージョンやexternalRefは書き換えません。

有効中だけデータセット画面へ「Madoからインポート」を表示します。「Madoで見る」は外部参照が指す接続と固定バージョンを使い、Madoの`/lineage?mode=versions&versionId=…&node=…`へ移動します。Mado側では本人のログインと権限が必要です。

Runの状態遷移と送信待ちを同じtransactionで保存します。OpenLineage本文・hash・接続先・設定revisionを固定し、失敗時は同じ本文を再送します。入力は取り込んだMadoのidentity、ローカル出力はProject IDを含む名前です。別のMadoで取り込んだ外部参照をそのまま流用しません。

無効中は新しい取り込みと配送を止め、送信待ちを新規作成しません。既に送信中の処理は完了できます。再有効化では既存未送信分だけを再開し、無効中のRunは遡及送信しません。過去の取り込みと送信記録は残ります。

履歴がある接続のAPI/Web/OpenLineage URLは変更できません。別のMadoには新しい名前の接続を作り、既存参照の送信先を保持します。アクセストークンの入れ替えや接続設定の変更はrevisionを進め、検索・確認の古い結果を破棄します。

送信成功直後に応答やDB更新を失うと同じ本文を再送する場合があります。運用者が用意するMado Registryには、同じOpenLineage eventを同じRunとバージョンとして扱う実装が必要です。Mado入口の重複応答だけから、実RegistryのDB動作を保証しません。

## 旧HTTPサービスから移行する

migration 059は接続UUID、旧enabled、外部参照、送信待ち、event IDを保持します。旧manifest.id=madoの接続だけを移行候補にし、移行待ちは配送・新規取り込みを止めます。その他の旧Pluginは削除せず、無効化と名前変更だけできます。複数接続は自動統合しません。

1. DBと旧サービスのledger（`PLUGIN_LEDGER_DIRECTORY`）を退避します。旧サービスの送信中の処理を完了させてからAPIを更新します。
2. 同じ接続の設定画面に、旧サービスの実Mado設定と、そのMadoで発行したアクセストークンを保存します。旧baseUrlはbridgeのURLなのでMado URLへ転用しません。設定保存だけでは配送を再開しません。
3. 無効または移行待ちで接続確認を行います。旧ledgerがある場合は下の管理スクリプトで引き継ぎます。イベントIDと本文hashが一致する記録だけを配送済みにし、違いは409で停止します。
4. 参照結果と設定先を確認して「移行を完了」を実行します。この操作は旧enabledを維持するため、無効で確認を進めたい場合は先に無効にしておきます。送信の確認は、移行完了後に連携を有効にしてから、検証用の実Runを1件実行し、START/COMPLETEと入出力を確認します。無効中のRunは送信されず、後から有効にしても遡及送信しません。
5. 旧サービスに依存しなくなったことを確認し、旧bridgeを停止してbridge用キーを失効します。本体の`MMT_MADO_PLUGIN_TOKEN`と旧サービスの`MMT_PLUGIN_TOKEN`は新方式には不要です。

```sh
# MMT_API_TOKEN: 全体管理者のadmin scope token。値をコマンド引数やログへ出さない。
# MMT_API_URL: 本体のAPI origin（例 http://127.0.0.1:4182）。
node --env-file=/path/to/private.env node_modules/tsx/dist/cli.mjs \
  scripts/import_plugin_receipts.ts <project-id> <plugin-id> /path/to/old/ledger
```

スクリプトは旧ledgerの`<event-id>.json`にあるdigestだけを読み、最大1000件単位で送ります。知らないイベント・不一致・60秒のleaseが有効な送信中の行があれば、その単位は登録されません。leaseが切れている送信記録は引き継げます。元ledgerは変更しません。DB更新前に同じキーで書かれた本文を再生成し、本文の順序と旧producerを保持して照合します。
