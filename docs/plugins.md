# 内蔵Mado連携

Mado連携は本体に標準搭載され、本体と同時にビルド・更新します。新しいProjectでは未設定・無効です。設定なしでも実験管理を利用でき、Madoへ通信しません。画面では「連携」、内部の型・テーブル・ルートでは既存のPlugin名を使います。

連携がMadoから使うのは、アクセストークン自身の情報（`/api/mado/access-token`）と、容量メトリクス（`/api/mado/metrics/capacity`）の2つです。有効にすると、「連携」の画面でMadoが計測したストレージの容量を確認できます。データセットの検索・取り込みと、Runの記録の送信（OpenLineage）はありません。MadoがDataLineageを外した（Mado v0.6.0）ので、この2つを本体から外しました。

## 設定する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ストレージ用・通知用の鍵とは分け、DBと一緒に安全に保管します。再起動ごとに作り直さないでください。
2. MadoのSettings → Access → Access Tokensで、Capacityの「読み取り」と、容量を見る接続を許可したアクセストークンを発行します。
3. Projectの「連携」で全体管理者がMadoのAPI URL、Web URLとアクセストークンを保存します。API URLはAPI serverが呼ぶ接続先、Web URLは設定の表示にだけ使います。保存後も初期無効です。
4. 「接続を確認」で、Madoの`/api/mado/access-token`からトークンの許可範囲（名前・scope・有効期限）を取得して保存し、`metrics:read`があれば容量APIを確認します。
5. 「連携を有効にする」で有効にし、もう一度「接続を確認」を押すと、容量を表示します。

画面に出す許可範囲は前回の接続確認で保存した値です。Madoの側でトークンの許可を変えたら、接続を確認し直します。

Madoには`/api/mado/access-token`と`/api/mado/metrics/capacity`が必要です。前者の無いMadoへの接続確認は502 `plugin_mado_access_token_unsupported`で止まります。Mado側の`docs/model-tracking-api.md`を参照してください。

Mado v0.5.3までは`/api/mado/access-token`の応答に`namespaces`が付き、v0.6.0からは付きません。本体はどちらの応答も受け付け、名前・scope・有効期限だけを保存します。

| 操作 | 権限 |
| --- | --- |
| 接続設定・アクセストークンの保存、有効切替 | 全体管理者 |
| 接続確認、容量 | Project admin |

アクセストークンはAES-256-GCMで暗号化保存し、画面やAPIには設定の有無だけを返します。編集時に入力を空にすると保存済みのトークンを維持します。保存用の鍵を失った場合、旧値を復号できません。保存用の鍵を復旧するか、アクセストークンを再入力して保存します。

アクセストークンの入れ替えや接続設定の変更はrevisionを進め、前回の接続確認の結果を破棄します。無効中は容量を取得しません。接続確認は無効中でもできます。

## 以前のバージョンのデータ

v0.5.4まではMadoのデータセットの固定バージョンを取り込み、Runの記録をMadoへ送っていました。そのデータは次のように残ります。

- 取り込んだデータセットバージョン: そのまま残り、Runの入力に使えます。外部参照（`externalRef`）と、metadataの`madoDatasetId`・`madoVersionId`は値を表示するだけで、Madoの画面へのリンクにはしません。
- 外部参照を持つ接続: データセットバージョンが外部参照で指している接続は、API URLとWeb URLを変更できません（409）。別のMadoには新しい名前の接続を作ります。
- 送ったRunの記録: `plugin_outbox`の行は送信済みのものも未送信のものも残ります。新しい行は足さず、未送信の行も送りません。このテーブルを読む画面とAPIはありません。
- 接続の設定: migration 073が接続の設定からOpenLineage URL・RunのNamespace・ストレージの識別名を、保存済みの確認結果からNamespaceを外します。API URL・Web URL・アクセストークン・有効／無効はそのままです。
- 送信の滞留のアラート: 開いていたもの（`plugin.delivery_stalled`）はmigration 073が閉じます。過去のアラートは運用アラートの履歴に残ります。この種別を選んだ通知ルールも残りますが、通知は届きません。

APIの`POST /projects/:p/datasets/:id/versions`は今も`externalRef`付きの登録を受け付けます（[API契約](api-contract.md)）。
