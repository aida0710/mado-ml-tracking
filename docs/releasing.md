# GitHub Releaseとコンテナを公開する

`v0.1.0`のようなタグを付けると、5種類のコンテナをビルドし、GHCRとGitHub Releaseへ公開します。通常のリリースとして登録し、Composeと設定例を添付します。

## 公開の前に確認する

mainの同じcommitでCIが成功し、アプリ・SDK・タグのバージョンが一致することが条件です。本文は`docs/releases/<tag>.md`に置きます。

版を上げるときは、ルート・`apps/*`・`packages/*`の`package.json`（`npm install --package-lock-only`でlockfileも）、`python/pyproject.toml`の版をそろえ、`npm run openapi:generate`で`docs/openapi.json`の版も更新します。忘れるとCIの`openapi-coverage`が落ちます。

```sh
npm ci
node scripts/release/version.mjs v0.1.0
node --test scripts/release/bundle.node-test.mjs
```

## タグを作る

変更をmainへ入れ、自動検査が成功した後で、mainのcheckoutから`scripts/release/publish.sh`を実行します。mainの最新commitであること、作業ツリーに変更が無いこと、そのcommitでmainのCIが成功していること、版とリリースノート、同じタグがまだ無いことを確かめ、タグ名を入力するとannotated tagを作ってpushします。`--verify-only`を付けると確認だけで止まります。2つ目の引数は、タグのメッセージに添える1行の要約です。

```sh
scripts/release/publish.sh --verify-only v0.1.0
scripts/release/publish.sh v0.1.0 '初回のリリース'
```

## 配布処理

Web、API、preview、worker、launcherをLinux amd64/arm64向けにビルドします。イメージ名は`scripts/release/images.mjs`で管理し、stagingタグから取得したdigestを配布用Composeへ固定します。ソースのComposeから生成するため、任意のworker・launcher・Forgejoの設定も同じです。

公開前にはログインなしで全イメージを取得し、新しいDBへのmigration、Web/APIの応答、未認証の拒否、プレビュー起動、worker/launcherのCLIを検査します。GHCRの新しいpackageは初期状態でprivateになるため、初回はpackageの設定でpublicにしてください。読み取りを公開したことを検査できるまでは、GitHub Releaseを公開しません。

配布物にはSHA-256のチェックサム、コンテナにはSBOMとビルド由来の情報、bundleにはGitHubのビルド証明を付けます。既にあるバージョンタグが別のdigestを指していたら停止し、公開済みのイメージは差し替えません。

失敗した処理は同じタグを指定して再実行できます。

```sh
gh workflow run release.yml --ref v0.1.0 -f tag=v0.1.0
```

タグが指すcommitは変更せず、公開済みのReleaseを更新して再公開しません。修正には次のバージョンを使います。

## 環境へ入れる

公開の処理はGitHubとGHCRだけを操作し、動いている環境には接続しません。環境へは公開した配布物（イメージをdigestで固定したCompose）を入れ、サーバーではソースをビルドしません。配布物の中身を運用のディレクトリへ写し、`.env`と`compose.override.yml`はその環境のものをそのまま使います。DBの更新は新しいイメージで`db:migrate`を実行して当てます。

手順は配布物の[README](../deploy/release/README.md)にあります。「更新する」でバックアップ・イメージの取得・切り替え・確認を行い、入れた版・commit・イメージ・最新のmigration・バックアップの場所をサーバーの`deploy/current-release.json`に書きます。「戻す」はそのバックアップから前の版へ戻します。ソースのcheckoutからビルドして動かしている環境は、同じREADMEの「ソースのcheckoutから配布物へ移す」で一度だけ移します。
