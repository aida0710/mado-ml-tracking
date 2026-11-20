# mado S3 Data Catalogへの接続

mado S3 Data Catalogへの接続は本体に標準搭載され、全体で1つ持ちます。最初は未接続です。接続しなくても実験管理を利用でき、mado S3 Data Catalogへ通信しません。

接続すると、次の3つができます。

| できること | どこで | 誰が |
| --- | --- | --- |
| `s3://`の場所をmado S3 Data Catalogの画面で開く | データセットのバージョンのURI、モデルのバージョンの重みのURI | Projectを読める人 |
| mado S3 Data Catalogの画面のURLを、`s3://`のURIとストレージ接続に直す | データセットとモデルのバージョンを作る画面のURIの欄 | Projectを編集できる人 |
| mado S3 Data Catalogが測ったストレージの容量を見る | 全体設定 → 全体管理 → 「Plugins」 | 全体管理者 |

mado S3 Data Catalogから読むのは、アクセストークン自身の情報（`/api/mado/access-token`）、ストレージ接続の一覧（`/api/mado/connections`）、容量メトリクス（`/api/mado/metrics/capacity`）の3つです。mado S3 Data Catalog v0.6.0以降が要ります。接続の設定と容量は全体管理者だけが扱います。Projectのメンバーに見せるのは、画面のURLとストレージ接続の名前・種類だけです。

**ストレージ接続**は、mado S3 Data Catalogに登録したS3の接続先（オンプレミスのS3、AWSなど）の1つです。mado S3 Data Catalogでは「接続（Connection）」と呼びます。

## 接続する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ストレージ用・通知用の鍵とは分け、DBと一緒に安全に保管します。再起動ごとに作り直さないでください。
2. mado S3 Data CatalogのSettings → Access → Access Tokensで、Capacityの読み取りと、使うストレージ接続（mado S3 Data Catalogの接続）を許可したアクセストークンを発行します。
3. 全体設定 → 全体管理 → 「Plugins」で「mado S3 Data Catalogに接続」を押し、URLとアクセストークンを入れて「接続」を押します。URLは、ブラウザでmado S3 Data Catalogを開くときのもの（例: `https://catalog.example.test`）です。APIは同じURLの下を呼ぶので、別に入力するものはありません。

「接続」を押すと接続を確かめ、通ったときだけ保存します。確かめるのは、アクセストークンの許可範囲（名前・scope・有効期限）を読めること、ストレージ接続の一覧を読めること、`metrics:read`があれば容量を読めることです。通ればすぐ容量が出ます。有効・無効の切り替えはありません。

| 操作 | 何をするか |
| --- | --- |
| 接続を確認 | 保存済みのアクセストークンで確かめ直し、許可範囲とストレージ接続の一覧を読み直す。mado S3 Data Catalogでトークンの権限・接続・期限を変えたあとに押す |
| 接続を変更 | URLかアクセストークンを入れ替える。アクセストークンを空欄にすると保存済みのものを使う。URLを変えるときは入力が要る（保存済みのトークンを別のURLへ送らない） |
| 接続を解除 | 保存したアクセストークンを消す |

容量を読めないアクセストークンでも接続は保存します。そのときは容量の代わりに、Capacityの読み取りを許可するよう求める注意を出します。

アクセストークンはAES-256-GCMで暗号化して保存し、画面にもAPIにも返しません。`MMT_PLUGIN_SECRET_KEY`を失うと保存済みのトークンを復号できないので、鍵を戻すか、「接続を変更」でアクセストークンを入力し直します。

## ストレージ接続を指定して登録する

mado S3 Data Catalogに接続済みのサイトでは、`s3://`のURIを登録するときに、その場所があるストレージ接続を指定します。指定しないと登録できません（422 `data_catalog_storage_connection_required`）。

| 登録の方法 | 指定のしかた |
| --- | --- |
| 画面（データセット／モデルのバージョンを作成） | URIに`s3://`を入れると出る「ストレージ接続」で選ぶ |
| API | 本文の`dataCatalogStorageConnectionId`。IDは`GET /api/projects/:p/data-catalog`の`storageConnections`で引く |
| Python SDK | `register_dataset`・`register_model`の`data_catalog_storage_connection_id`。IDは`client.data_catalog(project_id)`で引く |

- 必須になるのは、人・API・SDKが登録する`s3://`のURIだけです。`file://`や`https://`のURI、Artifactを中身にするバージョン、未接続のサイトでは指定できません（422 `data_catalog_storage_connection_not_applicable`）。
- Jobの出力の宣言、Taskの出力の登録、MLflowのクライアントが作るバージョンは、ストレージ接続を持ちません。接続済みでも今までどおり作れ、リンクは出ません。
- 指定できるのは、アクセストークンに許可したストレージ接続です。一覧は接続・確認のときに覚えます。覚えていないIDが来たときだけmado S3 Data Catalogへ読み直し、それでも無ければ断ります（422 `data_catalog_storage_connection_unknown`）。mado S3 Data Catalogと通信できなくても、覚えているストレージ接続なら登録できます。
- **ストレージ接続は、リンクの行き先を決めるだけです。** 実行先のコンピュータがどのS3から読むかは、今までどおり実行先の環境変数（`AWS_*`）で決まります。
- v0.5.4までのPython SDKは`s3://`のURIをストレージ接続なしで送るので、接続済みのサイトでは登録できなくなります。SDKを更新して引数を足します。

## S3の場所をmado S3 Data Catalogで開く

ストレージ接続を持つバージョンには、URIの横に「mado S3 Data Catalogで開く」のリンクが出ます。押すと、mado S3 Data Catalogのそのフォルダかファイルの画面が別のタブで開きます。中身を見られるかは、mado S3 Data Catalogのログインと権限で決まります。

- リンクが出るのは、バージョンのストレージ接続が今の一覧にあるときだけです。ストレージ接続を持たないバージョン（この機能より前に登録したもの、Jobの出力など）、接続を解除したサイト、別のmado S3 Data Catalogへ接続し直したあとの古いIDには出ません。
- 末尾が`/`のURIはフォルダとして、それ以外はファイルとして開きます（mado S3 Data Catalogの決まり）。フォルダを末尾の`/`なしで登録したURIは、親のフォルダが開きます。

## mado S3 Data CatalogのURLをS3のURIに直す

データセットのバージョンを作る画面の「URI」と、モデルのバージョンを作る画面の「重みのURI」に、mado S3 Data Catalogの画面のURL（フォルダやファイルのメニューの「Web URLをコピー」の値）を貼ると、対応する`s3://`のURIを示します。「S3のURIに直す」を押すと、欄の値を置き換え、URLにあるストレージ接続を選びます。`https://`もURIとして有効なので、自動では書き換えません。フォルダのURLは末尾が`/`のURIに、ファイルのURL（`?preview=`付き）はそのファイルのURIになります。

## 接続できないとき

APIは理由を`code`で返し、画面はその文をそのまま出します。

| code | 文 | 直し方 |
| --- | --- | --- |
| `data_catalog_access_token_rejected` | mado S3 Data Catalog rejected the access token; check that it is correct and has not expired | アクセストークンが正しいか、無効化・期限切れでないかを確かめる |
| `data_catalog_access_token_required` | enter the access token of this mado S3 Data Catalog | アクセストークンを入力する（初めての接続と、URLを変えるとき） |
| `data_catalog_access_token_unsupported` | no mado S3 Data Catalog API was found at this URL (/api/mado/access-token); check the URL | URLがmado S3 Data Catalogのものかを確かめる |
| `data_catalog_storage_connections_unsupported` | this mado S3 Data Catalog cannot list connections (/api/mado/connections); update it to v0.6.0 or later | mado S3 Data Catalogをv0.6.0以降へ更新する |
| `data_catalog_request_failed` | failed to communicate with mado S3 Data Catalog; check the URL | API serverからそのURLに届くかを確かめる |
| `data_catalog_capacity_not_permitted` | the access token does not allow reading capacity; allow it in mado S3 Data Catalog and check the connection again | mado S3 Data CatalogでトークンにCapacityの読み取りを許可し、「接続を確認」を押す |
| `data_catalog_secret_key_unavailable` | set MMT_PLUGIN_SECRET_KEY on the API server to store the access token | API serverに`MMT_PLUGIN_SECRET_KEY`を設定して再起動する |
| `data_catalog_secret_decryption_failed` | the stored access token cannot be decrypted; check MMT_PLUGIN_SECRET_KEY or enter the access token again | 鍵を戻すか、アクセストークンを入力し直す |

アクセストークンの応答からは、名前・scope・有効期限だけを保存します（v0.5.3までが返す`namespaces`など、ほかの項目は捨てます）。ただし、v0.5.3まではストレージ接続の一覧のAPIが無いので、接続できません。APIの詳細は[API契約](api-contract.md)にあります。

## 以前のバージョンのデータ

v0.5.4までは接続をProjectごとに持ち、mado S3 Data Catalogのデータセットを取り込み、Runの記録を送っていました。

- Projectごとの接続: 引き継ぎません。全体管理者が「Plugins」で接続し直します。行（`plugin_connections`）は残りますが、migration 074がアクセストークンと確認の結果を消します。
- 取り込んだデータセットバージョン: そのまま残り、Runの入力に使えます。外部参照（`externalRef`）と、metadataの`madoDatasetId`・`madoVersionId`は値を表示するだけです。`externalRef`付きの新しい登録は受け付けません。
- 送ったRunの記録: `plugin_outbox`の行は残ります。読む画面とAPIはありません。
- 送信の滞留のアラート（`plugin.delivery_stalled`）: 過去のものが運用アラートの履歴に残ります。今は発生しません。
