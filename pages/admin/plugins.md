---
title: Mado連携
description: 標準搭載・初期無効のMado連携の設定、バージョン固定の取り込み、Runの送信と旧接続の移行。
---

# Mado連携

Mado連携は本体に標準搭載され、本体と同時にビルド・更新します。新しいProjectでは未設定・無効です。設定なしでも実験管理を利用でき、Madoへ通信しません。画面では「連携」、内部の型・テーブル・ルートでは既存のPlugin名を使います。

## 設定する

1. API serverに`MMT_PLUGIN_SECRET_KEY`を設定します。`openssl rand -base64 32`で専用の鍵を作り、`.env`へ保存します。ほかの暗号鍵（`MMT_SESSION_ENCRYPTION_KEY`、`MMT_STORAGE_SECRET_KEY`、`MMT_HOOK_SECRET_KEY`）とは別の値にし、DBと一緒に安全に保管します。再起動ごとに作り直さないでください（[環境変数](/reference/environment#mado-plugin)）。
2. MadoのService Accountsで`lineage:read`、`lineage:write`、必要なら`metrics:read`のキーを用途別に発行します。参照用は検索Namespace、送信用はjobNamespaceと入出力に使うNamespaceを許可します。容量は全体の情報なのでmetrics用のNamespaceはありません。
3. 全体管理者がProjectの［連携］を開き、［Madoの接続設定］で「Mado API URL」「Mado Web URL」「OpenLineage URL」「許可Namespace」「RunのNamespace」「ストレージの識別名」とキーを入力して［保存］を押します。3つのURLは異なる入口を使えます。「OpenLineage URL」が空欄なら、Mado API URLへ送ります。保存後も初期無効です。
4. ［接続を確認］で参照と、容量取得用キーがあれば容量APIを確認してから、［連携を有効にする］を押します。確認では架空のRunを送信しません。送信用キーは実Runを1件実行して確認します。

Madoの参照APIには`/api/mado/lineage/catalog`、`datasets/:id`、`versions/:id`が必要です。Mado側の`docs/model-tracking-api.md`を参照してください。Registryへ直接アクセスせず、Madoの認証済みAPIだけを使います。

| 操作 | 権限 |
| --- | --- |
| 接続設定・キーの保存、有効切替、旧接続の移行 | 全体管理者 |
| 接続確認、検索、取り込み、容量、再送 | Project admin |
| 取り込んだデータセットをMadoで見る | Projectを読める利用者 |

キーはAES-256-GCMで暗号化保存し、画面やAPIには設定有無だけを返します。編集時に入力を空にすると既存キーを維持します。容量取得用キーは「容量取得用キーを削除」で削除できます。保存用の鍵を失った場合、旧値を復号できません。保存用の鍵を復旧するか、保存済みのすべてのキーを再入力して保存します。

## データセットとRun

検索結果から固定バージョンを選ぶと、APIがそのIDをMadoから再取得してNamespace・URI・digestを検証します。同じバージョンを同時に取り込んでも同じDatasetVersionを返します。既存バージョンやexternalRefは書き換えません。

有効中だけ、データセット画面に［Madoからインポート］（Project admin）と［Madoで見る］を表示します。［Madoで見る］は外部参照が指す接続と固定バージョンを使い、Madoの`/lineage?mode=versions&versionId=…&node=…`へ移動します。Mado側では本人のログインと権限が必要です。

Runの状態遷移と送信待ちを同じtransactionで保存します。OpenLineage本文・hash・接続先・設定revisionを固定し、失敗時は同じ本文を再送します。入力は取り込んだMadoのidentity、ローカル出力はProject IDを含む名前です。別のMadoで取り込んだ外部参照をそのまま流用しません。

無効中は新しい取り込みと配送を止め、送信待ちを新規作成しません。既に送信中の処理は完了できます。再有効化では既存未送信分だけを再開し、無効中のRunは遡及送信しません。過去の取り込みと送信記録は残ります。

履歴がある接続のAPI/Web/OpenLineage URLは変更できません。別のMadoには［Madoの接続を追加］で新しい名前の接続を作り、既存参照の送信先を保持します。資格情報の更新やNamespace・RunのNamespaceの変更はrevisionを進め、検索・確認の古い結果を破棄します。

送信成功直後に応答やDB更新を失うと同じ本文を再送する場合があります。運用者が用意するMado Registryには、同じOpenLineage eventを同じRunとバージョンとして扱う実装が必要です。Mado入口の重複応答だけから、実RegistryのDB動作を保証しません。

## 旧HTTPサービスから移行する {#migrate-a-legacy-bridge}

migration 059は接続UUID、旧enabled、外部参照、送信待ち、event IDを保持します。旧manifest.id=madoの接続だけを移行候補にし、移行待ちは配送・新規取り込みを止めます。その他の旧Pluginは削除せず、無効化と名前変更だけできます。複数接続は自動統合しません。

1. DBと旧サービスのledger（`PLUGIN_LEDGER_DIRECTORY`）を退避します。旧サービスの送信中の処理を完了させてからAPIを更新します。
2. 同じ接続の設定画面に、旧サービスの実Mado設定・Namespace・キーを保存します。旧baseUrlはbridgeのURLなのでMado URLへ転用しません。設定保存だけでは配送を再開しません。
3. 無効または移行待ちで接続確認を行います。旧ledgerがある場合は下の管理スクリプトで引き継ぎます。イベントIDと本文hashが一致する記録だけを配送済みにし、違いは409で停止します。
4. 参照結果と設定先を確認して［移行を完了］を押します。この操作は旧enabledを維持するため、無効で確認を進めたい場合は先に無効にしておきます。送信の確認は、移行完了後に連携を有効にしてから、検証用の実Runを1件実行し、START/COMPLETEと入出力を確認します。無効中のRunは送信されず、後から有効にしても遡及送信しません。
5. 旧サービスに依存しなくなったことを確認し、旧bridgeを停止してbridge用キーを失効します。本体の`MMT_MADO_PLUGIN_TOKEN`と旧サービスの`MMT_PLUGIN_TOKEN`は新方式には不要です。

```sh
# MMT_API_TOKEN: 全体管理者のadmin scopeのtoken。Projectに限定せず、所有者がそのProjectのAdminであること。値をコマンド引数やログへ出さない。
# MMT_API_URL: 本体のAPI origin（例 http://127.0.0.1:4182）。
node --env-file=/path/to/private.env node_modules/tsx/dist/cli.mjs \
  scripts/import_plugin_receipts.ts <project-id> <plugin-id> /path/to/old/ledger
```

画面から発行できるtokenはProjectに限定されるため、このスクリプトでは403（`admin_required`）になります。Projectに限定しないtokenは、全体管理者でログインしたブラウザの開発者ツールのコンソールから、APIで発行します（tokenの発行はログイン中の画面からだけ受け付けます）。表示された`token`は一度しか表示されないので、`MMT_API_TOKEN`として私用のファイルに保存し、取り込みが終わったら失効してください。

```js
const response = await fetch('/api/tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'import plugin receipts',
    kind: 'personal',
    scopes: ['admin'],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
});
const { token, item } = await response.json();
console.log(item.id, token);
// 取り込みが終わったら失効する:
// await fetch(`/api/tokens/${item.id}`, { method: 'DELETE' });
```

スクリプトは旧ledgerの`<event-id>.json`にあるdigestだけを読み、最大1000件単位で送ります。知らないイベント・不一致・60秒のleaseが有効な送信中の行があれば、その単位は登録されません。leaseが切れている送信記録は引き継げます。元ledgerは変更しません。DB更新前に同じキーで書かれた本文を再生成し、本文の順序と旧producerを保持して照合します。
