# mado S3 Data Catalogへの接続

mado S3 Data Catalogへの接続は本体に標準搭載され、全体で1つ持ちます。最初は未接続です。接続しなくても実験管理を利用でき、mado S3 Data Catalogへ通信しません。

接続すると、mado S3 Data Catalogが測ったストレージの容量を、全体設定 → 全体管理 → 「Plugins」で確認できます。使うのは、アクセストークン自身の情報（`/api/mado/access-token`）と容量メトリクス（`/api/mado/metrics/capacity`）の2つだけです。扱えるのは全体管理者だけで、Projectの画面には出しません（容量はmado S3 Data Catalogの接続とバケットの単位で、Projectとは対応しないため）。

## 接続する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ストレージ用・通知用の鍵とは分け、DBと一緒に安全に保管します。再起動ごとに作り直さないでください。
2. mado S3 Data CatalogのSettings → Access → Access Tokensで、Capacityの読み取りと、容量を見る接続を許可したアクセストークンを発行します。
3. 全体設定 → 全体管理 → 「Plugins」で「mado S3 Data Catalogに接続」を押し、URLとアクセストークンを入れて「接続」を押します。URLは、ブラウザでmado S3 Data Catalogを開くときのもの（例: `https://catalog.example.test`）です。APIは同じURLの下を呼ぶので、別に入力するものはありません。

「接続」を押すと接続を確かめ、通ったときだけ保存します。確かめるのは、アクセストークンの許可範囲（名前・scope・有効期限）を読めることと、`metrics:read`があれば容量を読めることです。通ればすぐ容量が出ます。有効・無効の切り替えはありません。

| 操作 | 何をするか |
| --- | --- |
| 接続を確認 | 保存済みのアクセストークンで確かめ直し、許可範囲を読み直す。mado S3 Data Catalogでトークンの権限や期限を変えたあとに押す |
| 接続を変更 | URLかアクセストークンを入れ替える。アクセストークンを空欄にすると保存済みのものを使う。URLを変えるときは入力が要る（保存済みのトークンを別のURLへ送らない） |
| 接続を解除 | 保存したアクセストークンを消す |

容量を読めないアクセストークンでも接続は保存します。そのときは容量の代わりに、Capacityの読み取りを許可するよう求める注意を出します。

アクセストークンはAES-256-GCMで暗号化して保存し、画面にもAPIにも返しません。`MMT_PLUGIN_SECRET_KEY`を失うと保存済みのトークンを復号できないので、鍵を戻すか、「接続を変更」でアクセストークンを入力し直します。

## 接続できないとき

APIは理由を`code`で返し、画面はその文をそのまま出します。

| code | 文 | 直し方 |
| --- | --- | --- |
| `data_catalog_access_token_rejected` | mado S3 Data Catalog rejected the access token; check that it is correct and has not expired | アクセストークンが正しいか、無効化・期限切れでないかを確かめる |
| `data_catalog_access_token_required` | enter the access token of this mado S3 Data Catalog | アクセストークンを入力する（初めての接続と、URLを変えるとき） |
| `data_catalog_access_token_unsupported` | no mado S3 Data Catalog API was found at this URL (/api/mado/access-token); check the URL | URLがmado S3 Data Catalogのものかを確かめる |
| `data_catalog_request_failed` | failed to communicate with mado S3 Data Catalog; check the URL | API serverからそのURLに届くかを確かめる |
| `data_catalog_capacity_not_permitted` | the access token does not allow reading capacity; allow it in mado S3 Data Catalog and check the connection again | mado S3 Data CatalogでトークンにCapacityの読み取りを許可し、「接続を確認」を押す |
| `data_catalog_secret_key_unavailable` | set MMT_PLUGIN_SECRET_KEY on the API server to store the access token | API serverに`MMT_PLUGIN_SECRET_KEY`を設定して再起動する |
| `data_catalog_secret_decryption_failed` | the stored access token cannot be decrypted; check MMT_PLUGIN_SECRET_KEY or enter the access token again | 鍵を戻すか、アクセストークンを入力し直す |

mado S3 Data Catalog v0.5.3までは`/api/mado/access-token`の応答に`namespaces`が付き、v0.6.0からは付きません。本体はどちらの応答も受け付け、名前・scope・有効期限だけを保存します。APIの詳細は[API契約](api-contract.md)にあります。

## 以前のバージョンのデータ

v0.5.4までは接続をProjectごとに持ち、mado S3 Data Catalogのデータセットを取り込み、Runの記録を送っていました。

- Projectごとの接続: 引き継ぎません。全体管理者が「Plugins」で接続し直します。行（`plugin_connections`）は残りますが、migration 074がアクセストークンと確認の結果を消します。
- 取り込んだデータセットバージョン: そのまま残り、Runの入力に使えます。外部参照（`externalRef`）と、metadataの`madoDatasetId`・`madoVersionId`は値を表示するだけです。`externalRef`付きの新しい登録は受け付けません。
- 送ったRunの記録: `plugin_outbox`の行は残ります。読む画面とAPIはありません。
- 送信の滞留のアラート（`plugin.delivery_stalled`）: 過去のものが運用アラートの履歴に残ります。今は発生しません。
