---
title: Plugins（mado S3 Data Catalogへの接続）
description: 全体で1つのmado S3 Data Catalogへの接続の設定と、mado S3 Data Catalogが測ったストレージの容量の確認。
---

# Plugins（mado S3 Data Catalogへの接続）

「Plugins」は、ほかのサービスとの接続を置く画面です。今あるのはmado S3 Data Catalogへの接続だけです。接続は全体で1つで、どのProjectにも共通です。最初は未接続で、接続しなくても実験管理を利用でき、mado S3 Data Catalogへ通信しません。

接続すると、mado S3 Data Catalogが測ったストレージの容量をこの画面で確認できます。画面を開けるのは全体管理者だけです。

## 接続する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ほかの暗号鍵（`MMT_SESSION_ENCRYPTION_KEY`、`MMT_STORAGE_SECRET_KEY`、`MMT_HOOK_SECRET_KEY`）とは別の値にし、DBと一緒に安全に保管します。再起動ごとに作り直さないでください（[環境変数](/reference/environment#mado-plugin)）。
2. mado S3 Data Catalogの**Settings → Access → Access Tokens**で、Capacityの**読み取り**と、容量を見る接続を許可したアクセストークンを発行します。
3. ユーザーメニューかProjectのサイドバーの下端の［全体設定］を開き、サイドバーの「全体管理」で［Plugins］を開きます（`/settings/plugins`）。
4. ［mado S3 Data Catalogに接続］を押し、「URL」と「アクセストークン」を入れて［接続］を押します。「URL」は、ブラウザでmado S3 Data Catalogを開くときのURLです（例: `https://catalog.example.test`）。

［接続］を押すと接続を確かめ、通ったときだけ保存します。通ると「接続済み」になり、アクセストークンの名前、許可されている操作、有効期限、最後に接続を確認した日時と、「ストレージの容量」（接続・バケット・プレフィックスごと）が出ます。

## 接続を確認・変更・解除する

| ボタン | 何をするか |
| --- | --- |
| ［接続を確認］ | 保存済みのアクセストークンで確かめ直し、許可されている操作と有効期限を読み直します。mado S3 Data Catalogでトークンの許可や期限を変えたあとに押します |
| ［接続を変更］ | URLかアクセストークンを入れ替えます。アクセストークンを空欄にすると、保存済みのものをそのまま使います。URLを変えるときは入力してください |
| ［接続を解除］ | 保存したアクセストークンを消します。もう一度使うには、アクセストークンを入力して接続し直します |

「このアクセストークンでは容量を読めません。」と出たら、mado S3 Data CatalogでアクセストークンにCapacityの読み取りを許可してから、［接続を確認］を押します。

アクセストークンは暗号化して保存し、画面にもAPIにも返しません。`MMT_PLUGIN_SECRET_KEY`を失うと保存済みのトークンを復号できないので、鍵を戻すか、［接続を変更］でアクセストークンを入力し直します。

接続できないときは、[困ったとき](/reference/troubleshooting#plugin-unreachable-or-deliveries-stalled)を見てください。

## 以前のバージョンから更新したとき

v0.5.4までは、接続をProjectごとに持ち、mado S3 Data Catalogのデータセットを取り込み、Runの記録を送っていました。

- Projectごとの接続は引き継ぎません。保存していたアクセストークンは更新のときに消えるので、全体管理者が［Plugins］で接続し直します。
- 取り込んだデータセットバージョンはそのまま残り、Runの入力に使えます。データセット画面は外部参照の値を表示します。新しく取り込むことはできません。
- 送ったRunの記録はDBに残りますが、画面には出しません。
