---
title: Mado連携
description: 標準搭載・初期無効のMado連携の設定と、Madoが計測したストレージの容量の確認。
---

# Mado連携

Mado連携は本体に標準搭載され、本体と同時にビルド・更新します。新しいProjectでは未設定・無効です。設定なしでも実験管理を利用でき、Madoへ通信しません。画面では「連携」、内部の型・テーブル・ルートでは既存のPlugin名を使います。

有効にすると、Madoが計測したストレージの容量を［連携］の画面で確認できます。連携がMadoから使うのは、アクセストークン自身の情報と容量メトリクスだけです。データセットの検索・取り込みと、Runの記録の送信はありません（MadoがDataLineageを外したため、この2つを外しました）。

## 設定する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ほかの暗号鍵（`MMT_SESSION_ENCRYPTION_KEY`、`MMT_STORAGE_SECRET_KEY`、`MMT_HOOK_SECRET_KEY`）とは別の値にし、DBと一緒に安全に保管します。再起動ごとに作り直さないでください（[環境変数](/reference/environment#mado-plugin)）。
2. Madoの**Settings → Access → Access Tokens**で、Capacityの**読み取り**と、容量を見る接続を許可したアクセストークンを発行します。
3. 全体管理者がProjectの［連携］を開き、［Madoの接続設定］で「Mado API URL」「Mado Web URL」「アクセストークン」を入力して［保存］を押します。「Mado API URL」はAPI serverが呼ぶ接続先で、「Mado Web URL」は設定の表示にだけ使います。保存後も初期無効です。
4. ［接続を確認］を押します。アクセストークンの許可範囲（許可されている操作、有効期限）をMadoから取得して画面に出し、容量の読み取りを許可していれば容量を参照できるかを確かめます。
5. ［連携を有効にする］を押し、もう一度［接続を確認］を押します。容量の読み取りを許可したトークンなら、Storage metricsに接続・バケット・プレフィックスごとの容量が出ます。

画面に出る許可範囲は前回の接続確認で保存した値です。Madoでトークンの許可を変えたら、［接続を確認］で更新します。

Madoには、アクセストークン自身の許可範囲を返す`/api/mado/access-token`と、容量メトリクスの`/api/mado/metrics/capacity`が必要です。`/api/mado/access-token`の無いMadoでは、接続確認が「this Mado cannot report the permissions of its access token (/api/mado/access-token); update Mado」で止まるので、Madoを更新してください。Mado側の`docs/model-tracking-api.md`を参照してください。Mado v0.5.3までとv0.6.0以降のどちらにもつながります。

| 操作 | 権限 |
| --- | --- |
| 接続設定・アクセストークンの保存、有効切替 | 全体管理者 |
| 接続確認、容量 | Project admin |

アクセストークンはAES-256-GCMで暗号化保存し、画面やAPIには設定の有無だけを返します。編集時に入力を空にすると保存済みのトークンを維持します。保存用の鍵を失った場合、旧値を復号できません。保存用の鍵を復旧するか、アクセストークンを入れ直して保存します。

アクセストークンの入れ替えや接続設定の変更はrevisionを進め、前回の接続確認の結果を破棄します。無効中は容量を取得しません。接続確認は無効中でもできます。

## 以前のバージョンで取り込んだデータセットと送ったRun

v0.5.4まではMadoのデータセットの固定バージョンを取り込み、Runの記録をMadoへ送っていました。

- 取り込んだデータセットバージョンはそのまま残り、Runの入力に使えます。データセット画面は外部参照（接続、Madoでのバージョンの識別子、Namespace・名前・バージョン）の値を表示します。Madoの画面へのリンクは出しません。
- データセットバージョンが外部参照で指している接続は、「Mado API URL」と「Mado Web URL」を変更できません。別のMadoには［Madoの接続を追加］で新しい名前の接続を作ります。
- 送ったRunの記録はDBに残りますが、画面には出しません。未送信だった記録は送りません。
- 接続の設定にあった「OpenLineage URL」「RunのNamespace」「ストレージの識別名」は、更新のときに外れます。「Mado API URL」「Mado Web URL」、アクセストークン、有効／無効はそのままです。
