# GitHub Releaseとコンテナを公開する

`v0.1.0`のようなタグを付けると、5種類のコンテナをビルドし、GHCRとGitHub Releaseへ公開します。通常のリリースとして登録し、Composeと設定例を添付します。

## 公開の前に確認する

mainの同じcommitでCIが成功し、アプリ・SDK・タグのバージョンが一致することが条件です。本文は`docs/releases/<tag>.md`に置きます。

```sh
npm ci
node scripts/release/version.mjs v0.1.0
node --test scripts/release/bundle.node-test.mjs
```

変更をmainへ入れ、自動検査が成功した後でannotated tagを作ります。

```sh
git fetch origin
git tag -a v0.1.0 origin/main -m '初回の0.1.0リリース'
git push origin v0.1.0
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
