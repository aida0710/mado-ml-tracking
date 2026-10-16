---
title: Mado連携
description: 標準搭載・初期無効のMado連携の設定、バージョン固定の取り込み、Runの送信。
---

# Mado連携

Mado連携は本体に標準搭載され、本体と同時にビルド・更新します。新しいProjectでは未設定・無効です。設定なしでも実験管理を利用でき、Madoへ通信しません。画面では「連携」、内部の型・テーブル・ルートでは既存のPlugin名を使います。

## 設定する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ほかの暗号鍵（`MMT_SESSION_ENCRYPTION_KEY`、`MMT_STORAGE_SECRET_KEY`、`MMT_HOOK_SECRET_KEY`）とは別の値にし、DBと一緒に安全に保管します。再起動ごとに作り直さないでください（[環境変数](/reference/environment#mado-plugin)）。
2. Madoの**Settings → Access → Access Tokens**で、DataLineageの**読み取り**と**送信**を許可したアクセストークンを発行します（プリセットの**ML Tracking連携**で選べます）。Namespaceには、取り込むデータセットのNamespaceと、Runの記録を送るNamespace（既定は`mado-model-tracking`）を許可します。容量メトリクスも見る場合は、Capacityの**読み取り**と対象の接続も許可します。
3. 全体管理者がProjectの［連携］を開き、［Madoの接続設定］で「Mado API URL」「Mado Web URL」「OpenLineage URL」「RunのNamespace」「ストレージの識別名」「アクセストークン」を入力して［保存］を押します。Namespaceの一覧は入力しません。3つのURLは異なる入口を使えます。「OpenLineage URL」が空欄なら、Mado API URLへ送ります。保存後も初期無効です。
4. ［接続を確認］を押します。アクセストークンの許可範囲（許可されている操作、許可Namespace、有効期限）をMadoから取得して画面に出し、許可されたNamespaceと、容量の読み取りを許可していれば容量を参照できるかを確かめます。読み取りか送信を許可していないトークンや、「RunのNamespace」を許可していないトークンは、ここで理由を示して断ります。確認では架空のRunを送信しません。確認できたら［連携を有効にする］を押し、送信は実Runを1件実行して確かめます。

検索と取り込みでは、その時点でMadoが返す許可範囲を使います。MadoでトークンのNamespaceを足したり外したりしても、接続設定を保存し直す必要はありません。画面の表示は［接続を確認］で更新します。

Madoには、アクセストークン自身の許可範囲を返す`/api/mado/access-token`と、参照API`/api/mado/lineage/catalog`、`datasets/:id`、`versions/:id`が必要です。`/api/mado/access-token`の無いMadoでは、接続確認が「このMadoはアクセストークンの許可範囲の取得（/api/mado/access-token）に対応していません」で止まるので、Madoを更新してください。Mado側の`docs/model-tracking-api.md`を参照してください。Registryへ直接アクセスせず、Madoの認証済みAPIだけを使います。

| 操作 | 権限 |
| --- | --- |
| 接続設定・アクセストークンの保存、有効切替 | 全体管理者 |
| 接続確認、検索、取り込み、容量、再送 | Project admin |
| 取り込んだデータセットをMadoで見る | Projectを読める利用者 |

アクセストークンはAES-256-GCMで暗号化保存し、画面やAPIには設定の有無だけを返します。編集時に入力を空にすると保存済みのトークンを維持します。保存用の鍵を失った場合、旧値を復号できません。保存用の鍵を復旧するか、アクセストークンを入れ直して保存します。


## データセットとRun

検索結果から固定バージョンを選ぶと、APIがそのIDをMadoから再取得してNamespace・URI・digestを検証します。同じバージョンを同時に取り込んでも同じDatasetVersionを返します。既存バージョンやexternalRefは書き換えません。

有効中だけ、データセット画面に［Madoからインポート］（Project admin）と［Madoで見る］を表示します。［Madoで見る］は外部参照が指す接続と固定バージョンを使い、Madoの`/lineage?mode=versions&versionId=…&node=…`へ移動します。Mado側では本人のログインと権限が必要です。

Runの状態遷移と送信待ちを同じtransactionで保存します。OpenLineage本文・hash・接続先・設定revisionを固定し、失敗時は同じ本文を再送します。入力は取り込んだMadoのidentity、ローカル出力はProject IDを含む名前です。別のMadoで取り込んだ外部参照をそのまま流用しません。

無効中は新しい取り込みと配送を止め、送信待ちを新規作成しません。既に送信中の処理は完了できます。再有効化では既存未送信分だけを再開し、無効中のRunは遡及送信しません。過去の取り込みと送信記録は残ります。

履歴がある接続のAPI/Web/OpenLineage URLは変更できません。別のMadoには［Madoの接続を追加］で新しい名前の接続を作り、既存参照の送信先を保持します。アクセストークンの入れ替えや接続設定の変更はrevisionを進め、検索・確認の古い結果を破棄します。

送信成功直後に応答やDB更新を失うと同じ本文を再送する場合があります。運用者が用意するMado Registryには、同じOpenLineage eventを同じRunとバージョンとして扱う実装が必要です。Mado入口の重複応答だけから、実RegistryのDB動作を保証しません。
