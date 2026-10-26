# 検証手順

DBテストは専用の`mmt_test`へ接続し、テスト専用schema内でmigrationを適用します。開発DBや既存Mado DBを渡さないでください。

`npm test`は、DBを使うAPIのintegration test（`apps/api/test/*.integration.test.ts`）を同時に6ファイルまでに抑え、ほかのテストを先に並列で実行します（`vitest.config.ts`）。ファイルごとに接続poolとschemaを作るため、CPU数のまま並列にすると`mmt_test`の接続上限（100）やlock表を使い切り、`too many clients already`や`out of shared memory`で落ちていました。別のworktreeから同じ`mmt_test`へ同時にテストを流すと、この上限を超えることがあります。

```bash
npm run typecheck
npm run build
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55483/mmt_test npm test
cd python
uv sync --extra test --extra telemetry
uv run pytest
```

S3のprotocolテストは別のterminalでMotoのローカルemulatorを起動して実行します。通常の`npm test`ではS3接続テストはskipされます。

```bash
uv tool run --from 'moto[server]==5.2.1' moto_server -H 127.0.0.1 -p 4569
MMT_TEST_S3_ENDPOINT=http://127.0.0.1:4569 npm test -- packages/platform/src
```

S3テストは専用bucketを作り、multipart upload、保存byte数とSHA-256、Range取得、失敗upload、削除を確認してbucketを消します。emulatorの結果は実際のS3権限やネットワークの確認を含みません。

## 実S3の保存・取得を確認する

`scripts/verify_s3_artifacts.ts`は、`.env`のS3設定（`MMT_S3_BUCKET`、`MMT_S3_ENDPOINT`、`MMT_S3_REGION`、`MMT_S3_PREFIX`、`MMT_S3_FORCE_PATH_STYLE`、`MMT_S3_ACCESS_KEY_ID`、`MMT_S3_SECRET_ACCESS_KEY`）を使い、APIと同じ`createS3ArtifactStore`で既存bucketを検証します。bucketは作成しません。書き込みは`<MMT_S3_PREFIX>/verification/<JSTの日付>/<uuid>/`の下に限り、最後にそのprefixのobjectと未完了のmultipart uploadを消します。

実bucketで実行する前に、利用者がbucket、`MMT_S3_PREFIX`、認証情報を置く.envの変数名、書き込み・削除してよい範囲を決めます。決まったら、確認の印として`MMT_VERIFY_S3_CONFIRM=write-and-delete`を付けて実行します。付けない場合は何もせず終了コード2で止まります。

```bash
MMT_VERIFY_S3_CONFIRM=write-and-delete MMT_VERIFY_S3_LABEL=<検証対象の呼び名> \
node_modules/.bin/tsx scripts/verify_s3_artifacts.ts
```

| 段階 | 確認すること |
|---|---|
| `small-put-get` | 小さいobjectの保存byte数・SHA-256と全体取得 |
| `range-and-suffix-range` | 明示Range、suffix range（`bytes=-500`）、末尾指定なし、範囲外の終端の切り詰め、満たせないRangeの拒否 |
| `multipart-over-16mib` | 17MiB超をmultipartで保存し、digest、partの境界をまたぐRange、ETagのpart数を照合 |
| `interrupted-multipart-cleanup` | 2 part送った後に送信元を中断し、objectが見えないことと、ListMultipartUploadsから消えることを確認 |
| `outside-prefix-denied` | `MMT_S3_PREFIX`の外へのPut/Getが拒否されるか（IAMの範囲確認） |
| `remove` | 削除後に読めないことと、2回目の削除が成功すること |
| `cleanup-run-prefix` | 検証prefixの残りを消し、空になったことを確認 |

結果は`artifacts/verification/<日付>/s3/s3-integration.json`に保存します（`MMT_VERIFY_S3_OUTPUT`でファイル名を変更可）。bucket名、endpoint、object key、認証情報は書きません。SDKのエラーは、名前、HTTP status、ネットワークのエラーコードだけを残します。失敗が1件でもあれば終了コードは1です。

warningは「失敗ではないが、利用者が判断すること」を示します。

- `outside-prefix-denied`: prefixの外へ書けた・読めた。書けた場合はすぐ削除し、`outsideObjectRemoved`に記録します。外側のprefixは`MMT_VERIFY_S3_OUTSIDE_PREFIX`（既定`mmt-verification-outside-prefix`）で、不要なら`MMT_VERIFY_S3_SKIP_OUTSIDE_PREFIX=true`で省きます。書き込みを拒否された場合、Getは存在しないkeyへ送ります（`getTarget=missing-key`）。存在しないkeyへのGetは、読み取りと一覧の両方の権限があると404、どちらかが無いと403になります。404ならprefixの外を読めます。403は一覧の権限が無いだけでも返るので、読み取りの拒否を厳密には示しません。`MMT_S3_PREFIX`が空なら比較できないのでskipします。
- `interrupted-multipart-cleanup`: `abortFinishedBeforeReject=false`は、保存の失敗が返った時点ではAbortMultipartUploadが終わっておらず、後から消えたことを示します（`pendingUploadGoneAfterMs`）。その間にprocessが落ちると未完了のpartが残るので、実bucketにはAbortIncompleteMultipartUploadのlifecycle ruleを設定してください。ListMultipartUploadsの権限が無い場合もwarningです。
- `multipart-over-16mib`: ETagにpart数が無いS3互換サービスではwarningにします。

Motoで試す場合は、別terminalで起動したemulatorにbucketを作ってから、環境変数で接続先を渡します。`MMT_VERIFY_ENV_FILE=none`で`.env`を読みません（環境変数は常に`.env`より優先します）。

```bash
uv tool run --from 'moto[server]==5.2.1' moto_server -H 127.0.0.1 -p 4569
MMT_VERIFY_ENV_FILE=none MMT_VERIFY_S3_CONFIRM=write-and-delete MMT_VERIFY_S3_LABEL=moto \
MMT_VERIFY_S3_OUTPUT=s3-integration-moto.json \
MMT_S3_BUCKET=<作成したbucket> MMT_S3_ENDPOINT=http://127.0.0.1:4569 MMT_S3_FORCE_PATH_STYLE=true \
MMT_S3_PREFIX=mado-model-tracking MMT_S3_ACCESS_KEY_ID=testing MMT_S3_SECRET_ACCESS_KEY=testing \
node_modules/.bin/tsx scripts/verify_s3_artifacts.ts
```

2026-10-08にMoto 5.2.1で実行し、失敗0件でした。MotoはIAMを評価しないため`outside-prefix-denied`はwarningになります。`interrupted-multipart-cleanup`もwarningで、未完了uploadは保存の失敗が返ってから約0.2秒後に消えました。実bucketでの実行は未確認です。

ローカルJobの結合検証では、実APIにコード・モデル・データセットを登録してPython workerで実行します。Runの完了、メトリクス、Artifact、モデル登録、data/model lineage、親の重みからのfine-tuning、2 Jobの並列実行、停止、再実行、worker復帰を確認します。CPUの小さいfixtureはモデル学習の精度やGPU性能を検証するものではありません。

OIDCテストは署名鍵を持つローカルproviderでAuthorization Code＋PKCEを実行し、state/nonce/署名、ブラウザbinding、scope/Project権限を確認します。実際のAuthentik設定は[運用手順](operations.md)で確認します。

確認用スクリーンショットと実行結果はgitignoreした`artifacts/verification/<日付>/`に保存します。認証情報を画像やJSONへ含めません。

## 実APIの結合検証を再実行する

開発API/Webを起動し、API/worker双方のlocal executorを許可して実行します。検証用ProjectとComputeTargetを作り、終了時に一時Service Account tokenを失効します。結果を確認しやすいようRunと登録データは残します。

```bash
PYTHONPATH=python/src python/.venv/bin/python scripts/verify_worker.py
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
node scripts/verify_browser.mjs
```

`MMT_VERIFY_PYTHON`にvenv/pipを使えるPythonの絶対パスを指定します。worker検証の後にbrowser検証を行うと、実際の学習Runとlineageを撮影できます。

## モデルの自動実行と実Dockerを確認する

開発APIとlocal executorを用意し、Docker daemonを操作できるユーザーで実行します。検証用Project・Target・ルールを作り、CPU用の固定digestイメージでモデル登録から推論/評価、結果の回収、停止、worker再接続まで確認します。終了時にルールを無効化し、一時tokenを失効します。

```bash
docker pull node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
PYTHONPATH=python/src python/.venv/bin/python scripts/verify_containers.py
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
node scripts/verify_container_browser.mjs
```

`MMT_VERIFY_CONTAINER_IMAGE`で同じNodeコマンドを使える別のdigest固定イメージへ変更できます。`artifacts/verification/<日付>/containers/container-integration.json`に結果を保存します。browser検証はそのProjectを使い、画面からDockerのコードバージョンと無効なルールを新規登録し、有効／無効の切り替えを実APIで確認します。検証後はルールを無効に戻し、同じディレクトリへ結果と画像を保存します。

GPUは使用しません。Singularity/Apptainerの起動・停止・SIF照合はPythonのテストで確認し、実SIF runtimeでの実行確認とは区別します。

## 学習から判定・昇格までを通す

学習→学習結果の自動登録→推論→評価→判定・昇格を、CPUの小さいfixtureで1本の流れとして確かめます。スクリプト（API・SDK・worker）とブラウザ（実際の画面）の2本があります。どちらもテスト専用DB（`MMT_TEST_DATABASE_URL`）に新しいschemaを作ってAPIを起動し、終了時に止めてschemaを削除します。稼働中の開発API・Web・DB（4182・5182・55483）には接続しません。portは47000〜47009を使います。

対象外: 実SSO（Authentik）、GPU、実S3、本番Mado、実SSH。workerはlocal executorで動かします。

### スクリプト（`scripts/verify_pipeline.py`）

```bash
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
PYTHONPATH=python/src python/.venv/bin/python scripts/verify_pipeline.py
```

APIは`scripts/serve_mlflow_verification.ts`でloopbackの47001に起動します（`MMT_VERIFY_PIPELINE_API_PORT`で変更）。workerは同じprocess内で`--once`と同じ処理（復帰または1件claim）を繰り返し、Service Accountのworker token（`read`・`worker:execute`・`artifacts:write`・`registry:write`）を使います。Jobごとにvenvを作り`httpx`をインストールするので、pipがパッケージを取得できる環境で実行します。Jobのworkspaceは`var/verification-pipeline/<時刻>/`に残ります。

各コードバージョンは`python/examples/`の`training.py`・`inference.py`・`evaluation.py`をそのまま入れ、`pipeline_entry.py`から起動します。`pipeline_entry.py`は、実行コードに渡ったtokenの種類（`GET /auth/token`の`job`）をログに出し、parametersに`jobTokenProbeRunId`があれば、そのRunへのmetricの書き込みを試してから例を実行します。

| 段階 | 確認すること |
|---|---|
| `setup` | Project、local target（python・docker）、Service Account 2件（worker用・自動実行の所有者用、どちらもadmin）、コードバージョン（学習・失敗する学習・推論・評価v1と評価v2-strict）、正解セット2バージョン（metadataにサンプルを書いたバージョンと、`reference.json`をuploadした`artifacts`のバージョン）、Model 2件（系列`linear`と`linear-declared`）、出力モデル設定付きの学習Taskを登録する。ruleと昇格policy（`autoPromote=true`、対象・基準alias＝`production`）は、global adminでないProject adminのユーザーが作る |
| `owner_transfer` | 4件のruleとpolicyの所有者をService Accountへ移し、作成者をProjectから外す。作成者は403になり、ruleの`runAsKind`は`service` |
| `training` | 学習TaskのRunが`finished`、`train.loss`40点が下がり、`model/weights.json`が残る。`training.py`はTaskの出力モデル設定を読んで自分では登録しない |
| `job_token_scope` | 実行コードのtokenはJob token（`job=true`）で、別Runへの書き込みは403 `job_token_forbidden`。別Runには何も記録されない |
| `output_registration` | Task側の登録が`registered`、バージョンの`sourceRunId`が学習Run、Runの出力はその1バージョンだけ |
| `inference` | 推論ruleがそのバージョンで1回起動し、Runの作成者はService Account。WAV 3件と出力DatasetVersionが残る |
| `evaluation` | 評価ruleが推論Runを上流に1回起動し、`upstreamDatasetVersionIds`が推論の出力。metricsが残り、コードは`MMT_UPSTREAM_RUN_ID`を読む |
| `auto_promotion` | 判定が`passed`（`baseline_missing_first_promotion`）、`promoted=true`。`production`がそのバージョンを指し、alias履歴の最新は`source=promotion_policy`・判定ID付き・操作者はService Account。`model-versions/:id/evaluations`に推論と評価がfinishedで並ぶ |
| `second_round_against_baseline` | 評価v2-strictのruleを足してから2回目の学習を流す。2バージョン目の判定は基準バージョン＝1バージョン目で`passed`、`production`が2バージョン目へ切り替わり、alias履歴は2件 |
| `manual_apply_and_comparison` | v2-strictのruleを1バージョン目の推論Runへ手動適用（`source=manual`）し、`evaluation-comparison`（候補＝2バージョン目、`baselineVersionId`＝1バージョン目、同じruleと評価コードバージョン）が`ok` |
| `declared_outputs_and_staged_reference` | 系列`linear-declared`の流れ。推論は`result.json` version 2で出力Datasetを宣言し（WAVは`container/inference/audio/`）、評価はworkerが用意した正解セット（`MMT_INPUT_DATASET_DIRS`の`reference.json`）で採点して、metricsを`result.json`で返す |
| `failed_training_skips_downstream` | 実行中にバージョンを登録してから失敗する学習。Runは`failed`、保留していた推論は`skipped`（`source_run_unsuccessful`） |
| `container_bulk_outputs` | Dockerがあるときだけ。`alpine`（digest固定、`MMT_VERIFY_CONTAINER_IMAGE`で変更）の推論ruleを1バージョン目へ手動適用し、1000ファイルを`artifactsManifest`で出す。1000件がArtifactになり、出力Datasetが登録され、targetへの`output-archive`は1回、ファイル単位の`output`は0回 |

結果は`artifacts/verification/<日付>/pipeline/pipeline-integration.json`に、段階ごとの`status`（`passed`・`failed`・`not_run`）、所要秒数、確認したIDと値を保存します。APIのログは同じディレクトリの`api.log`です。成功系（`owner_transfer`〜`manual_apply_and_comparison`）の途中で失敗すると、後の段階は`not_run`になります。最後の3段階は成功系と別のバージョンを使うので、成功系の結果にかかわらず実行します。Dockerやimageが無いときの`container_bulk_outputs`は`not_run`で、失敗に数えません。1件でも失敗すれば終了コードは1です。

`scripts/verify_pipeline_smoke.py`は同じスクリプトの短いバージョンで、2回目・手動適用・`result.json`・コンテナを除いた9段階を流します（port 47001、`MMT_VERIFY_SMOKE_API_PORT`で変更。結果は`pipeline-smoke/pipeline-smoke.json`）。

2026-10-08に全13段階（smokeは9段階）が成功しました。CPUのJobは1件あたり約5秒（venv作成と`httpx`のインストールを含む）、コンテナの1000ファイルは約30秒でした。

### ブラウザ（`apps/web/tests/browser-pipeline.mjs`）

```bash
npm run build -w @mmt/web
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chrome \
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/pipeline/screenshots \
node apps/web/tests/browser-pipeline.mjs
```

`apps/web/tests/fixtures/pipeline/serve.ts`が、`MMT_AUTH_MODE=local`のAPIとビルド済みのWebを同じport（47002、`MMT_PIPELINE_PORT`）で配信します。この検証サーバーだけはlocal executorを許可します（通常のAPIはdevelopment modeでしか許可しない）。全体管理者（初回にパスワード変更が必要）と、group `mmt-pipeline-viewers`に入ったユーザーを作ります。groupの所属はAuthentikの同期の代わりにDBへ直接入れます。パスワードは実行ごとに生成し、表示しません。workerは`mado-tracking-worker run`を別processで起動し、終了時に止めます。待ち合わせは画面の状態（`Finished`、`合格`など）を条件にし、自動で更新しない画面では再読み込みボタンを押して見直します。固定のsleepは使いません。

| 段階 | 画面で行うこと |
|---|---|
| `login_and_password_change` | ローカルアカウントでログインし、初回のパスワード変更を済ませる |
| `storage_connection_test` | 全体管理 → ストレージ（`/settings/storage`）で、filesystemの保存先の接続テストが「すべての段階が成功しました」 |
| `project_creation` | プロジェクトがまだ無い画面の「プロジェクトを作成」 |
| `api_setup` | 画面の無い準備をAPIで行う: local executorのtarget（画面ではdevelopment modeでしか選べない）、Experiment、正解セット、出力Dataset、Model |
| `service_account_worker` | 設定 → Service Accountを作成し、tokenを発行してworkerを起動する |
| `code_versions` | Code画面で学習・推論・評価のコードバージョンをinlineのファイルで作る（ファイルは貼り付けで入れ、保存内容が元のファイルと一致する） |
| `automation_rules_and_policy` | 推論rule（モデル登録）、評価rule（上流ruleの成功）、昇格policy（自動昇格なし）を作る |
| `training_task_with_output_model` | 出力モデル（既存のModel、`model/weights.json`）付きの学習Taskを作る |
| `first_run_to_evaluation` | Taskを通常実行し、Finished → バージョン1の自動登録 → モデルバージョン画面で推論・評価がFinished、metricsが表示される |
| `first_promotion_with_reason` | 昇格の判定（合格）から、理由を入れて`production`へ昇格する |
| `second_run_baseline_comparison` | 2回目のバージョンで「基準バージョンとの評価比較」に基準（`production`）の値が並び、理由を入れて昇格する |
| `alias_history` | Models画面のAliasの履歴に2回の昇格と理由が残る |
| `viewer_through_group_binding` | 設定 → Authentik groupでgroupにViewerを付け、そのユーザーでログインする。モデルバージョン画面は見られるが、操作は再読み込みだけで、rule・policyの作成ボタンが無い。aliasの変更はAPIでも403 |

結果は`artifacts/verification/<日付>/pipeline/browser-pipeline.json`（段階ごとの結果と所要秒数）と、同じディレクトリの`browser-pipeline-server.log`・`browser-pipeline-worker.log`です。2026-10-08に全13段階が成功しました（約1分）。

## 内蔵Mado連携のAPIを確認する

参照APIを追加したMado checkoutを指定すると、本体の内蔵処理→実Mado routesの接続を確認できます。Registryは隔離fixtureを使い、本番へは接続しません。

```bash
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55483/mmt_test \
MMT_VERIFY_MADO_ROOT=/path/to/mado node_modules/.bin/tsx scripts/verify_mado_plugin.ts
```

配置が違う場合は`MMT_VERIFY_MADO_ROOT`に参照APIを含むMadoのcheckoutを指定します。こちらのテストは専用schemaを最後に削除します。

## 公式MLflow 3 SDKを確認する

[MLflowの手順](mlflow.md)に従って、隔離Python環境へ公式SDKとscikit-learn、本体Python SDKを入れます。開発API/Webとlocal executorを起動し、次を実行します。

```bash
artifacts/verification/mlflow3-venv/bin/python scripts/verify_mlflow3.py
```

Run・nested Run、paramsの不変性、メトリクス履歴/検索、6MiB・空・日本語pathのArtifact転送とhash一致、入力Dataset、Logged Modelの保存/読み込み、Model Registry/alias、scikit-learn autologを公式SDKのまま検証します。モデル登録で自動評価Jobを起動し、実CPU workerから同じRunへSDKで結果を記録します。readonly・Project制限・無効tokenの拒否も確認します。

あわせて次も確認します。

- `mlflow.models.evaluate`のmetricsがRunとLogged Modelに入り、`eval_results_table.json`が一覧に出る
- 評価ルールを付けた登録モデルへバージョンを登録すると、`python/examples/mlflow_evaluation.py`がCPUのJobで動き、実行記録が1件、評価結果がJobのRunだけに入る（新しいRunを作らない）
- `log_table`・`log_image`・`log_dict`・`log_text`・`log_figure`の一覧と内容。wav・flacのContent-Typeの保持とRangeの206、nativeのcontent URLでのinline表示
- 自作pyfuncの複数ファイルモデルを`models:/名前@alias`で読み込んだ予測値の一致、`download_artifacts("models:/名前@alias")`のhash一致、`mlflow.search_runs`のpandas出力
- 見送ったAPIの挙動。webhooksと`search_traces`が404 `ENDPOINT_NOT_FOUND`の`MlflowException`になること、`@mlflow.trace`を付けた関数を含むRunが正常に終わること。評価とautologがTracingのAPIを呼んだかどうかも結果に記録する

各確認の結果は[MLflowの手順の確認状況](mlflow.md#公式sdkでの確認状況)にまとめています。

検証終了時に一時tokenを失効し、ルールを無効化します。結果は`artifacts/verification/<日付>/mlflow3/sdk-integration.json`へ保存します。`MMT_VERIFY_API_URL`を省略するとWebの`/api` proxyを通るため、通常は省略します。専用test schemaで試す場合は`MMT_TEST_DATABASE_URL`を設定して`node_modules/.bin/tsx scripts/serve_mlflow_verification.ts`を起動し、検証APIをloopback4184へ指定します。停止すると専用schemaを削除します。

2026-10-08にはPython 3.13.15でMLflow 3.0.0＋scikit-learn 1.6.1、MLflow 3.17.0＋scikit-learn 1.9.1の両方を検証しました。バージョン別の結果は`sdk-3.0-integration.json`と`sdk-3.17-integration.json`です。未検証の他ライブラリ・実HF/TFモデル・実GPUの動作はこの結果に含めません。

評価・表/画像/音声・自作pyfunc・見送ったAPIの確認は、同日に両方のバージョンで再実行して全件成功しました。このときは開発APIではなく専用test schemaのAPIをloopbackの47120で起動し、`MMT_VERIFY_API_URL`で指定しました。

TypeScriptの公式protobuf検証2件は、上記の`artifacts/verification/mlflow3-venv/bin/python`を使います。別のSDK環境を使う場合は`MMT_TEST_MLFLOW_PYTHON`にそのPythonの絶対パスを指定して`npm test`を実行します。SDKが未インストールの場合はこの2件だけskipします。

同日のMLflow互換追加時はTypeScript349件成功・実S3 fixture未起動の2件skip、Python188件と実Docker worker20件が成功しました。型検査、ビルド、strict mypy、ruffも通過しています。レビューで見つかった並行保存・改名のlock順、NaN検索、モデルの全メトリクス履歴/検索/並び順、SDK記録後のUIの数値・真偽値filterを回帰テストで確認しました。

画面の確認は3.17の結果ファイルを使います。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
node scripts/verify_mlflow_browser.mjs
```

SDKで作成したRunのメトリクス/params、モデル一式のArtifact、自動評価の推論結果、alias、data/model lineageを確認して画像と`browser-integration.json`を保存します。`MMT_WEB_URL`にLAN URLを指定すればprivate Originも含めて確認できます。

## Task・コード編集・実行前ソース保存を確認する

```bash
PYTHONPATH=python/src python/.venv/bin/python scripts/verify_workbench.py
```

公開Gitリポジトリの固定commitを読み込み、編集・削除したファイルを実CPU workerで実行します。通常とテストのコマンド、Taskの新しいバージョンを保存したあとも固定されるqueued Job、古いrevisionの409、失敗テストと再実行、実行前のsource ZIPとmanifest、履歴を確認します。コード自身がmain.pyを書き換えた場合も、ZIPが実行前の内容を保つことを照合します。検証用tokenは最後に失効し、targetを無効にします。結果は`artifacts/verification/<日付>/workbench/task-integration.json`です。

ブラウザからCompute、Monacoでの編集と新しいバージョンの保存、Task作成・テスト・学習・推論を確認する場合は、開発APIとworkerのlocal executorを許可します。内蔵Mado連携の検証は上のMado参照APIを持つ隔離fixtureで行います。旧HTTP fixtureの起動手順は現在の接続登録には使いません。

```bash
# 旧HTTP fixtureは内蔵連携では起動しません。
```

```bash
PYTHONPATH=python/src python/.venv/bin/python scripts/setup_workbench_playground.py
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://<LANのIP>:5182 \
node scripts/verify_workbench_browser.mjs
```

この操作はPlaygroundを残し、そのProjectとCPU targetだけを扱うworkerを起動します。Service Account tokenは7日で失効し、`var/playground/worker-settings.json`へmode600で保存します。ブラウザの確認後もTaskを編集・実行できます。再起動は`PYTHONPATH=python/src python/.venv/bin/python scripts/serve_workbench_worker.py`。workerの停止には`var/playground/worker.pid`のprocessを確認してSIGTERMを送り、設定画面で当該tokenを失効してください。

Madoの参照・容量・取り込み・配送の確認は前節の内蔵連携検証を使います。PlaygroundのIDと実行結果、閲覧用画像は`artifacts/verification/<日付>/workbench/`へ保存し、tokenの値を含めません。

2026-10-08の追加機能では、API・ストレージ366件、Web98件、Python316件、実Docker20件が成功しました。S3接続fixtureの2件はskipです。型検査・build・ruff・strict mypy、wheel/sdistの45ファイルと現ソースの一致も確認しました。

実APIとCPU workerの5 Jobで、Taskの新しいバージョンの保存、通常・失敗テスト、旧バージョンの再実行、Git差分、実行前ZIP、2件ずつの履歴取得を確認しました。実ブラウザでは8 Jobを実行し、Monacoで編集した係数によるメトリクスの7→10の変化、学習モデルを別の推論コードで読み込んだ予測値の一致、Compute/plugin管理、manifest・metrics・Dataset importを確認しました。ブラウザ回帰5本では未保存編集の戻る・進む、ネストした編集、保存待ちと履歴ページ切替も検証しています。公式MLflow 3.17.0の実SDK結合は再確認済みです。

実Authentik、SSH/GPU、実S3、実SIF runtime、本番Madoへの接続はこの結果に含みません。

## 前処理・学習・評価のワークフローを確認する

専用のテストDBを指定し、独立したAPIとCPU workerを起動します。Taskの設定、10件の入力データ、3ステップのワークフローを用意します。

```bash
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55483/mmt_test \
node_modules/.bin/tsx scripts/serve_workflow_verification.ts
```

APIの起動表示を待ち、別のターミナルでWebを起動します。

```bash
MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47160 \
npm run dev -w @mmt/web -- --host 127.0.0.1 --port 47161 --strictPort
```

さらに別のターミナルで、ブラウザの確認を実行します。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
node scripts/verify_workflow_browser.mjs
```

前処理で10件から8件を残し、その8件を学習して、出力モデルを評価する実ジョブを確認します。前処理は2つのファイルをディレクトリで宣言し、1つのデータセットバージョンとして学習へ渡します。画面からの定義作成・実行、新しいバージョンの保存、品質条件による後続Jobの停止、390px幅の表示も確認します。結果と画面は`artifacts/workflows/<JSTの日付>/`へ保存します。

終了時はAPIをCtrl+Cで停止します。workerとテスト用schemaを終了・削除し、検証用tokenを保存した`var/workflow-verification/worker-settings.json`も消します。このファイルの内容は記録へ転記しません。

## Run検索をブラウザで確認する

Experiments画面のサーバー側検索、cursorのページ送り、metricでの並べ替え、送信前の構文エラー、APIの400の表示を確かめます。スクリプトは`mmt_test`の一時schemaを使う独立したAPI（47100）を自分で起動し、80件のRunを用意します。WebはViteを47101で起動しておきます。

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47100 npx vite --port 47101 --strictPort --host 127.0.0.1) &
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55483/mmt_test \
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
npx tsx artifacts/verification/2026-10-08/run-search-browser/verify-run-search-browser.ts
```

このスクリプトはgitignoreした`artifacts/`の下にあり、リポジトリには含まれません。画像も同じディレクトリへ保存します。

## Run比較とCSV出力をブラウザで確認する

比較画面の基準Runの選択（URLの`baseline`）と差分表示、「差のある行だけ」、比較CSVのダウンロード（BOM・引用符・数式対策・差分行）、Experiments画面の「検索結果をCSV出力」（POSTをblobで受けてダウンロード、列順）を確かめます。スクリプトは`mmt_test`の一時schemaを使う独立したAPI（47084）を自分で起動します。WebはViteを47085で起動しておきます。

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47084 npx vite --port 47085 --strictPort --host 127.0.0.1) &
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
npx tsx artifacts/verification/2026-10-08/run-comparison-csv-browser/verify-run-comparison-csv-browser.ts
```

このスクリプトはgitignoreした`artifacts/`の下にあり、リポジトリには含まれません。画像も同じディレクトリへ保存します。

## 音声ビューア・評価サンプル表・Artifactの聴き比べを確認する

APIはブラウザ内のmockで差し替えるので、Webの開発サーバーだけを起動します（開発用の5182とは別のport）。

```bash
cd apps/web
MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47119 npx vite --port 47110 --strictPort --host 127.0.0.1 &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_WEB_URL=http://127.0.0.1:47110 \
MMT_SCREENSHOT_DIR=../../artifacts/verification/<日付>/artifacts-web \
node tests/browser-artifacts.mjs
```

WAV mono 16kHz・FLAC stereo 48kHz・MP3の波形とスペクトログラム（440Hz・1760Hzのbin位置、mel 80帯域）、クリックでのseek、ドラッグでのループ、64MiB超は再生だけになること、デコード失敗と再試行を確かめます。評価サンプル表（[評価サンプルの推奨形式](evaluation.md#評価サンプルの推奨形式)）ではページング、差分、`preload="none"`、壊れた行、別Projectの参照の拒否を、2つのRunの同じpathの聴き比べでは同じ位置からの切替を確認し、ライト/ダークの画像を保存します。fixtureは`apps/web/tests/fixtures/audio/`にあり、生成コマンドはスクリプト冒頭にあります。

## Artifactのアップロード（進み具合・取消・再開）をブラウザで確認する

スクリプトは`mmt_test`の一時schemaを使う独立したAPI（47080）を自分で起動します。WebはViteを47081で起動しておきます。APIをTypeScriptのソースから起動するので`tsx`で実行します。

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47080 npx vite --port 47081 --strictPort --host 127.0.0.1) &
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/artifacts-web \
npx tsx apps/web/tests/browser-artifact-upload.mjs
```

200MiBのファイルの送信中にネットワークを切り（Playwrightの`setOffline`）、失敗で止まったあと再読込して同じファイルを選び直すと、受信済みでないpartだけが送られてsha256が一致すること、一時停止→再開で受信済みのpartを送り直さないこと、取消でsessionが`aborted`になりArtifactが増えないこと、フォルダのuploadで相対pathが保存先フォルダの下に保たれること、送信中の再読込で`beforeunload`の警告が出ること、viewerにはアップロードのボタンが出ないことを確かめます。

## 全体管理画面の保存先を確認する

保存先APIはブラウザ内でmockし、サイドバーの「全体管理」→「ストレージ」（`/settings/storage`）で、保存先の作成（署名v2）→secretが「設定済み」とだけ出る→接続テストの段階表示→既定の切替（確認dialog）→プロジェクト切替の「プロジェクトを作成」で開いたダイアログの初期選択→全体管理者以外の拒否表示（`/settings/storage`から自分のアカウント（`/settings/account`）へ移され、サイドバーとユーザーメニューに全体管理が出ない。ユーザーメニューには「全体設定」が出る）、を確かめます。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:<Webのport> \
MMT_VERIFY_OUTPUT=artifacts/verification/<日付>/storage-web \
node apps/web/tests/browser-admin-storage.mjs
```

## プロジェクトの切り替え・全体管理のプロジェクト・保存先のディレクトリ候補を確認する

`apps/web/tests/browser-projects-admin.mjs`は、mockのAPI（`tests/browserApi.mjs`と`tests/projectAdministrationMock.mjs`）で次を確かめます。Webの開発サーバーだけを、開発用の5182とは別のportで起動します。

| 場面 | 確かめること |
|---|---|
| サイドバー | プロジェクトの組の最後が「プロジェクト管理」（Plugins、プロジェクト設定）で、「全体設定」と「全体管理」の組は出ない（全体設定はユーザーメニューから開く） |
| プロジェクト切替 | ボタンにフォーカスして↓で開くと、今のProjectが選ばれた状態で一覧へフォーカスが移る。↑↓・Home・Endで移り、Endは最後の「プロジェクトを作成」。Escで閉じてボタンへ戻り、Enterで開いて別のProjectを開ける。PrivateのProjectに鍵が付く。ドロップダウンが画面の内側に収まる。ライト・ダークの両方で撮影する |
| 絞り込み | Projectが8件以上になると絞り込みの入力が出てフォーカスが入り、入力した語で一覧が絞られ、Enterで開ける |
| 作成 | 切替の「プロジェクトを作成」から、Privateを選ぶと「メンバー（任意）」が出る。ユーザーを検索して2人足し、Roleを変え、1人を外して作成すると、`POST /projects`に`visibility: private`と残した1人の`members`が送られ、作ったProjectが開く |
| 全体管理 → プロジェクト | `/settings/projects`で開く。アーカイブの確認に「データは残り元に戻せる」とあり、待機中・実行中のJobの409は案内の文言になる。「アーカイブ済みも表示」でアーカイブ済みの行が出て、名前はリンクにならない。元に戻す、もう一度アーカイブ、完全に削除（プロジェクト名を正しく入れるまで押せない） |
| プロジェクト設定 | ViewerはPublic/Privateを変えられず、アーカイブの欄も無い。Project adminがアーカイブすると別のProjectへ移る。メンバー欄にPrivateの注記が出る |
| ディレクトリ候補 | 保存先の追加でfilesystemを選び、ルートディレクトリに`/srv/mmt/`と打つと子のディレクトリが候補に出る。↓・Enterで選べ、Escは候補だけを閉じてダイアログは残る。無いパスには「まだありません」、ファイルには「ディレクトリではありません」の注記が出る。相対パスの候補をクリックすると絶対パスが入る |
| 390px幅 | プロジェクトバーの切替が画面の内側に開き、全体管理のプロジェクト一覧も横にスクロールしない |

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:9 npx vite --port 47300 --strictPort --host 127.0.0.1) &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:47300 \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/web/projects-admin \
node apps/web/tests/browser-projects-admin.mjs
```

2026-10-11に通過しました（mockのAPIです。APIの公開範囲・アーカイブ・ディレクトリ候補の規則はAPIのテストで確かめます）。

## 全体設定のサイドバー・ユーザーメニューを確認する

`apps/web/tests/browser-settings-shell.mjs`は、mockのAPI（`tests/browserApi.mjs`）で全体設定（`/settings/<項目>`）を、全体管理者でない利用者と全体管理者の両方で開きます。Webの開発サーバーだけを別のportで起動します。

| 場面 | 確かめること |
|---|---|
| 全体管理者でない利用者 | プロジェクトの画面のサイドバーはプロジェクトの組だけで、「全体設定」と「全体管理」の組は無い。ユーザーメニューは「アカウント」「パスワードの変更」「全体設定」の3つ。「全体設定」で`/settings/account`が開き、見出しの上に「全体設定」、サイドバーは「全体設定」の組（アカウント、コンピュータ、このアプリについて）だけ。「パスワードの変更」（`/settings/account/password`）の間もサイドバーは「アカウント」に印が付く |
| 全体管理の拒否 | 非管理者が`/settings/users`を開くと`/settings/account`へ移り、管理者限定の案内を表示する |
| SSOの利用者 | ユーザーメニューに「パスワードの変更」が無く、`/settings/account/password`は`/settings/account`へ移る |
| 全体管理者 | プロジェクトの画面のサイドバーにも全体設定・全体管理の組は出ない。全体設定の画面では「全体設定」の下に「全体管理」の組（プロジェクト、ユーザー、ストレージ、ランチャー、監査ログ）が続く。`/settings/launchers?…`は問い合わせ文字列を保ったまま開き、知らない`/settings/<項目>`は`/settings/account`へ移る。全体管理の見出しの上は「全体管理」 |
| アイコンだけの列・ドロワー | 1100px幅のアイコンだけの列に全体設定と全体管理の8項目が名前のツールチップつきで並ぶ。390px幅のドロワーでは、プロジェクトの画面に全体設定の組が出ず、全体設定の画面では「全体設定」の組が出る |

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:9 npx vite --port 47310 --strictPort --host 127.0.0.1) &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:47310 \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/settings-shell \
node apps/web/tests/browser-settings-shell.mjs
```

2026-10-11に通過しました（mockのAPIです。全体管理のAPIが全体管理者以外を拒否することはAPIのテストで確かめます）。

## 誤操作・権限の防止をブラウザで確認する

`apps/web/tests/browser-permission-guards.mjs`は、mockのAPI（`tests/browserApi.mjs`）で、権限を変える操作の取り違えを防ぐ画面を確かめます。Webの開発サーバーだけを別のportで起動します。

| 場面 | 確かめること |
|---|---|
| メンバー | 最後のAdminの行は［変更］［外す］が押せず理由が出る。まだ誰もログインしていないgroupに「まだ誰もログインしていません」。［メンバーを追加］のRoleの既定はEditorで、既にいる人は「既にAdminです…」と出て選べず、Enterでも選ばれない。別の人を選んで保存すると`role: editor`で送る |
| プロジェクト設定 | 保存先の下に「既存のArtifactは今の保存先に残ります」が常に出る。公開範囲・保存先を変えて［保存］すると確認が出て、キャンセルでは何も送らない。［変更を保存］で`PATCH`する |
| "/"で開くProject | メンバーでない他人のPublicだけが見える人は「プロジェクト」の一覧に留まり（390px幅でも横にはみ出さない）、開いたProjectは次から"/"で開く。メンバーなら"/"でそのProjectを開く |
| Jobs | 「作成者」の列が出て、他人のJobには停止・再実行の代わりに「停止・再実行は作成者かProject adminだけができます」が出る。停止の確認にRun名・作成者・実行先・起きることが出て、ボタンは［停止する］。再実行は［再実行する］で新しいRunの画面へ移る |
| Models | editorには保護aliasに鍵と「保護alias（adminのみ）」が付き、［Aliasを解除］の代わりに必要な権限が出る |
| Datasets | ［バージョンを作成］のDigestに`sha256:`と64桁の説明（`sha256:`は省ける）が出る。使われているバージョンの削除は、APIの理由（409）を確認のダイアログに出す |

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:9 npx vite --port 47410 --strictPort --host 127.0.0.1) &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:47410 \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/permission-guards \
node apps/web/tests/browser-permission-guards.mjs
```

2026-10-11に通過しました（mockのAPIです。最後のAdmin・Jobの停止と再実行・digest・バージョンの削除の規則はAPIのテストで確かめます）。

## Webで足すコンピュータ（site）をブラウザで確認する

`apps/web/tests/browser-site-computers.mjs`は、mockのAPI（`tests/browserApi.mjs`）で全体設定の「コンピュータ」（`/settings/computers`）、プロジェクトのCompute画面、全体管理の「ランチャー」（`/settings/launchers`）を開きます。確認する項目は次のとおりです。

- ランチャーの登録（tokenを一度だけ表示）、tokenの作り直し、失効
- 全体管理者が雛形（Slurm）からPublicのコンピュータを足すときの送信内容（公開範囲の既定はPrivate）
- 共用アカウントの公開鍵、接続確認、鍵の作り直し
- job shellのバージョン（同じ内容なら新しいバージョンを作らない、新しいバージョン、過去のバージョンの表示）
- 研究者が自分のPC（手動投入、既定のPrivate）を足すこと、所有者だけに出る`--watch --all`の案内、編集でPublicにすること
- 他の人のPrivateのコンピュータは一覧に出るが、詳細を開けず接続先も出ないこと。全体管理者は編集できるが「使えない」と出ること
- プロジェクトのComputeは自分が使えるものの読み取りだけの一覧で、全体設定の「コンピュータ」へのリンクがあること
- 本人アカウントのコンピュータでの、自分のアカウント名と公開鍵
- Jobのjob shellのバージョン、`?projectId=`の一覧、390px幅で横にスクロールしないこと

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47129 npx vite --port 47120 --strictPort --host 127.0.0.1) &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_WEB_URL=http://127.0.0.1:47120 \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/site-computers-web \
node apps/web/tests/browser-site-computers.mjs
```

2026-10-11に通過しました（mockのAPIです。実際のlauncherが鍵を作る流れはAPIとPythonのテストで確かめます）。

## ssh・localのコンピュータの2段の追加をブラウザで確認する

`apps/web/tests/browser-computer-setup.mjs`は、mockのAPI（`tests/browserApi.mjs`と`tests/computerSetupMock.mjs`）で全体設定の「コンピュータ」（`/settings/computers`）の追加・編集を確かめます。mockのworkerは1台で、接続確認は次の読み込みで終わり、`/home/mmt/`・`/large/`だけを読めます。確認する項目は次のとおりです。

- 1段目「接続」: 種類の既定がSSH・公開範囲の既定がPrivate、オンラインのworkerが1台なら選ばれていること、SSH鍵とknown_hostsのパスがworkerの報告したパスから補完されること
- ［接続を確認して次へ］で、無効・作業ディレクトリとPythonが空のまま登録し（`POST /targets`）、選んだworkerを付けて確認を頼む（`POST /targets/:id/checks`の`worker`）こと
- 2段目「接続後の設定」が確認の結果で埋まること（Python、CPUと「確認の結果: x86_64」、動いたRuntime、見つかったGPUの全部、同時実行数＝GPUの数）。GPUの選択を外すと手入力の欄と同時実行数が追い、手入力のIDも残ること
- 作業ディレクトリを`/`で終わるところまで入力すると、workerにそのディレクトリを読ませ（`POST /targets/:id/directory-listings`のパスとworker）、中身から補完し、隠しディレクトリは`.`を打つまで出ないこと。Pythonは確認の候補から選べること
- ［保存］が接続後の設定の項目だけを送り、有効にすること（`PATCH /targets/:id`）
- 編集のダイアログは「接続」「接続後の設定」をタブで切り替えられ、［再確認］で新しい確認を頼むこと。変えた接続は確認の前に接続の項目だけ保存すること
- workerが確認を受け取らないと理由が出て、［確認せずに次へ］で手で入力して保存できること
- オンラインのworkerが無いと案内が出て、［接続を確認して次へ］が押せないこと
- 390px幅で横にスクロールしないこと

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47339 npx vite --port 47330 --strictPort --host 127.0.0.1) &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_WEB_URL=http://127.0.0.1:47330 \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/computer-setup/mock \
node apps/web/tests/browser-computer-setup.mjs
```

2026-10-11に通過しました（mockのAPIです。実際のworkerがSSHで確かめる流れは、APIの`target-setup-checks.integration.test.ts`、Pythonの`test_target_discovery.py`・`test_directory_listing.py`・`test_target_check_runner.py`と、確認用環境で確かめます）。`browser-containers.mjs`（Localのコンピュータを2段で足す）、`browser-site-computers.mjs`（種類にSiteを選ぶと1枚の欄）、`browser-workbench.mjs`（編集のタブ）も新しいダイアログに合わせました。

## IDを入れた接続の案内（SDK・MLflow、worker、手動投入）をブラウザで確認する

`apps/web/tests/browser-recording-connection.mjs`は、mockのAPIで「SDK・MLflow 3から接続」を確かめます。プロジェクト設定ではプロジェクトIDだけ、Experimentsで実験を選んで［SDKで記録］を開くと実験IDも入ること（`MMT_EXPERIMENT_ID`、MLflowの`set_experiment`に実験の名前）、［コピー］が値をそのまま写すこと、tokenの発行画面が記録用のscope（read・runs:write・registry:write・artifacts:write）を選んだ状態で開くこと、viewerには発行のボタンが出ないことを見ます。

`apps/web/tests/browser-copy-token-expiry.mjs`は、同じWebサーバをloopbackと、安全でないHTTPのorigin（LANのIPで開いたときと同じくClipboard APIが無い）の両方から開きます。後者はブラウザに`http://mmt-web.test`として見せ、中身はPlaywrightが127.0.0.1のWebサーバから取ってくるので、サーバを127.0.0.1の外へ開く必要はありません。Clipboard APIのある場合・拒否された場合・HTTPで使えない場合に、値と複数行の設定例を実際のクリップボードへ写せることを確かめます。失敗時にボタンが動かないこと、modal内のコピー、日英の言語ボタンの高さ、320pxでの表示、無期限・730日・小数の時間のtoken発行、0の有効期間の拒否も確認します。カレンダーの日時指定では、Asia/Tokyoの2027-12-31 23:59がUTCの14:59になること、選択肢を切り替えても日時が残ること、空欄・過去の日時の拒否、320pxの表示を確認します。APIの期限・認証・失効・権限は`service-accounts.integration.test.ts`で検証します。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:<Webのport> \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/copy-token-expiry \
node apps/web/tests/browser-copy-token-expiry.mjs
```

`apps/web/tests/browser-computer-guides.mjs`は、開発モード（`MMT_AUTH_MODE=development`）のAPIに、実行ごとに別の利用者・Project・コンピュータ・手動投入待ちのJobを作って確かめます。sshのコンピュータの詳細に、管理する人（全体管理者）にはコンピュータIDと、そのIDを入れたworkerの`install`・環境変数の例が出て、使うだけの人にはコンピュータIDと、概要の「workerの設定」の行に誰が設定するかだけが出ること、手動投入のsiteの詳細・Jobsの案内・［ジョブを起動］の確認の段に投入コマンドと準備（`mado-tracking`の入れ方、このページのURLを入れた`MMT_API_URL`、tokenを発行する場所とscope）が出てtokenの値は出ないこと、Jobsの［投入用のAPI tokenを発行］がread・jobs:writeのtokenを作ること、viewerにはそのボタンが出ないこと、390pxで横にずれないことを見ます。管理者は`MMT_DEVELOPMENT_ADMIN_EMAIL`（既定`admin@localhost`、違うときは`MMT_DEVELOPMENT_ADMIN_EMAIL`で渡す）です。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:<Webのport> \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/connection-guides \
node apps/web/tests/browser-computer-guides.mjs
```

## 実行の画面（workerの有無、Jobの詳細とログ、再実行、フックの複製）をブラウザで確認する

`apps/web/tests/browser-job-execution.mjs`は、開発モード（`MMT_AUTH_MODE=development`）のAPIに、実行ごとに別の利用者・Project・workerのいないsshのコンピュータ・3,000行のログを持つ待機中のJobを作って確かめます（workerは動かさない）。Computeの一覧・Jobsの一覧の上・待機中のJobの詳細・［ジョブを起動］の実行先に「workerなし」が出ること、全体設定 → コンピュータの詳細を`?computer=`で開け、接続確認の前に警告が出ること、Jobを選ぶと詳細が画面に入り見出しにフォーカスが移ること、ログが最新の2,000行（全3,000行と表示）を最新の位置で開き、時刻が秒まで、検索・並び順・全行の読み込み・ダウンロード（3,000行のタブ区切り）が動くこと、Runの画面にJobがあれば［ジョブを起動］の代わりに［Jobを見る］が出ること、最大試行回数1のJobを作成者が再実行できること、Jobを断られた起動がRunを残さないこと、フックを［複製して新しく作る］で設定ごと写せること、390pxで横にずれないことを見ます。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:<Webのport> \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/job-execution \
node apps/web/tests/browser-job-execution.mjs
```

## Webで足すコンピュータ（site）を実APIでブラウザ確認する

`apps/web/tests/browser-site-computers-api.mjs`は、`mmt_test`の一時schemaを使う開発モード（`MMT_AUTH_MODE=development`）のAPI（47140）を自分で起動し、実際の記録を作って全体設定の「コンピュータ」（`/settings/computers`）・Jobs画面・全体管理の「ランチャー」（`/settings/launchers`）を確かめます。終わるとschemaを消します。WebはViteを47141で起動しておきます。APIをTypeScriptのソースから起動するので`tsx`で実行します。

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47140 npx vite --port 47141 --strictPort --host 127.0.0.1) &
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55483/mmt_test \
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/site-computers-api-web \
npx tsx apps/web/tests/browser-site-computers-api.mjs
```

開発モードのログインで、全体管理者（`admin@localhost`）と、2つのProjectのEditorである研究者2人（Alice・Bob）を作ります。画面の無い準備（Project、メンバー、Dockerのコードバージョン）はAPIで作ります。コードバージョンのimageはdigest固定の例で、pullしません。launcherと`mado-tracking submit`の側（公開鍵の送信、接続確認の報告、claimとreport）は、それぞれのtokenでAPIを直接呼びます。確認する項目は次のとおりです。

| 場面 | 確かめること |
|---|---|
| launcher | 登録するとtokenを一度だけ表示し、閉じると画面にも一覧のAPIにも出ない。launcher.tomlにtokenを書かない。tokenを作り直すと古いtokenは401、新しいtokenで`GET /launcher/config`が通る。失効させると新しいtokenも401 |
| Publicのsite | 全体管理者がPBSの雛形から、本人アカウントの自動投入のコンピュータをPublicで足す（所有者は全体管理者、job shellは雛形のままバージョン1、取消コマンド・array・runtimeは雛形の値）。Dockerの雛形から共用アカウントのコンピュータも足し、共用の鍵は「作成待ち」で、接続確認は押せない |
| 自分の設定 | Editorがアカウント名と`GROUP`を保存すると、自分の鍵が「作成待ち」で出て、接続確認は押せない。launcherが公開鍵を送ると、公開鍵とauthorized_keysの案内に変わる。接続確認でlauncherに渡るアカウント・作業ディレクトリ・変数が画面で入れた値で、失敗の報告が結果に出る。管理者の「利用者の設定」に、アカウント・変数・鍵の状態が出る |
| 共用アカウント | 研究者には「自分の設定はありません」の案内だけが出る（入力、鍵、利用者の設定、job shellの編集が無い）。APIも個人設定を422で拒む |
| 自分のPC | 研究者が手動投入のPCを足す（公開範囲は既定のPrivate、共有先の欄は無い）。所有者には`--watch --all`まで3つのコマンドと、`--all`で受け取るのはtokenのProjectのJobだという案内が出る |
| job shell | 編集して保存するとバージョン2になり、バージョンの履歴に2つのバージョンが出て、バージョン1も表示できる |
| Private | 別の研究者には、一覧にそのPCが「Private」「使えない」で出るが、詳細は開けず作業ディレクトリも出ない。Jobの実行先の選択肢にも出ず、Jobを作るとAPIが422 `target_not_available` |
| Public | 所有者がPublicにすると、どちらのProjectでも実行先に選べる（`?projectId=`の一覧も同じ） |
| 手動投入 | そのPCで作ったJobは手動投入待ちになる。所有者には`--watch --all`のコマンドと`--all`の範囲の案内が出る。所有者でない依頼者には、自分のJobと同じ`mado-tracking submit --site <ID>`と、「このコンピュータは○○さんのコンピュータです。所有者が--watch --allで待ち受けているコンピュータ（所有者のPCなど）では、所有者の側で投入されます」の補足が出る（コンピュータの詳細にも同じ補足）。所有者のtokenで`--all`のclaimをするとバージョン2のjob shellで投入され、Jobの詳細に「job shellのバージョン」v2が出る |
| 公開範囲の編集 | 全体管理者がそのPCを編集すると、今の公開範囲（Public）が選ばれている。所有者がPrivateに戻すと、どちらのProjectの一覧からも消え、監査ログに`compute_target.update`（`visibility:{from,to}`）が残る（Jobが終わっていない間も、実行の設定を変えない編集は通る） |
| 390px幅 | 自分のPCの詳細、自分の設定と鍵、コンピュータの追加のダイアログ、Jobの詳細、launcherの一覧で、横にスクロールしない |

開発サーバーは、ファイルが変わると開いている画面をHMRで作り直します。そのため、走らせている間はWebのファイルを書き換えないでください。ファイルが変わる環境（作業コピーへの同期など）では、`npx vite build --outDir <dir>`したものを、同じ`MMT_WEB_API_PROXY_TARGET`で`npx vite preview --outDir <dir> --port 47141 --strictPort --host 127.0.0.1`して配ります。

実際のlauncher（ssh-keygen・SSH）、スケジューラ、`mado-tracking submit`のプロセスは使いません（それらがAPIへ送るものを同じ形で送ります）。2026-10-11に通過しました（Webは`vite`の開発サーバー）。

## 探索結果の分析（平行座標・パラメータ重要度・散布図）をブラウザで確認する

`apps/web/tests/browser-analysis.mjs`は、`/tests/fixtures/analysis-harness.html`（RunAnalysisPanelを単独でmountするページ）をmockのAPIで開きます。確認する項目は次のとおりです。

- 合成Run 300件で、brushによる絞り込みと、その結果がRun一覧の代わりの要素へ渡ること
- 重要度の表の並べ替え
- 散布図のclickでRun詳細へ移ること
- Sweepのobjectiveが目的の既定になること
- 5000件でdragの1ステップが200ms以内に応答すること

```bash
(cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47129 npx vite --port 47120 --strictPort --host 127.0.0.1) &
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_WEB_URL=http://127.0.0.1:47120 \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/analysis-web \
node apps/web/tests/browser-analysis.mjs
```

標準出力のJSONに、brush後の件数と、5000件でのdragの各ステップの時間（ms）が出ます。

## 共有レポートをブラウザで確認する

`apps/web/tests/browser-reports.mjs` は、開発モード（`MMT_AUTH_MODE=development`）のAPIに実際のRun・metrics・音声・保存ビューを作り、レポートの作成から閲覧までを確かめます。稼働中の開発用API・Webとは別のportで起動してください。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_WEB_URL=http://127.0.0.1:<Webのport> \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/reports-web \
node apps/web/tests/browser-reports.mjs
```

Markdown・グループの平均と範囲の図（固定と最新）・平行座標・音声の聴き比べ・保存ビューのRun一覧を埋め込んで保存できること、保存後にmetricsを足すと最新の図だけ変わること、2つのタブで同時に編集すると後の保存が衝突の案内になること、過去のバージョンは読み取り専用で戻すと新しいバージョンになること、コメント、viewerは閲覧とコメントの閲覧だけになること、アーカイブで一覧の既定表示から外れることを確かめます。

## Runの説明文とコメントをブラウザで確認する

`apps/web/tests/browser-comments.mjs`は、開発モード（`MMT_AUTH_MODE=development`）のAPIに対して、実際に記録を作って確かめます。稼働中の開発用API・Webとは別のportで起動してください。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chromium \
MMT_WEB_URL=http://127.0.0.1:<Webのport> \
MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/comments-web \
node apps/web/tests/browser-comments.mjs
```

説明文の8000文字超過は送信前に止まること、保存した説明文とMLflowの`runs/get`の`mlflow.note.content`が同じこと、`<script>`・`onerror`・`javascript:`リンクが実行されず文字として出ること、外部画像は読み込まずリンクになること、コメントの投稿・返信・編集（編集済み表示）・削除（「削除されました」）、viewerには入力欄と操作が出ないこと、モデルバージョンの詳細ページに別のスレッドが出ることを確かめます。

`apps/api/test/harness.ts`はWebのOriginを`http://127.0.0.1:5182`に固定するため、別portのWebから使うときはOriginを付け替える検証用の小さなserverが要ります（2026-10-08の検証では`/tmp`に置いて使い、リポジトリには入れていない）。


## 内蔵Madoの実APIブラウザ確認

専用のPostgreSQLテストDBと、参照APIを含むMado checkoutを使います。MadoのHTTPルートは実装を使い、Registryの応答だけをfixtureに置き換えます。本番の接続先は使いません。

```sh
MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
MMT_VERIFY_MADO_ROOT=/path/to/mado \
node_modules/.bin/tsx scripts/serve_mado_verification.ts

# 別terminal: 専用Web6084を起動
MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:6083 \
node_modules/.bin/vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 6084 --strictPort apps/web

# PlaywrightとChromiumの場所を設定して実行
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chrome \
node scripts/verify_builtin_mado_browser.mjs
```

APIは独立schemaを作り、終了時に削除します。fixtureの一時キーはgitignore済みの`var/builtin-mado-verification.json`（mode 600）だけに保存し、終了時に削除します。結果とキー入力を含まない画像は`artifacts/builtin-mado/<JSTの日付>/`に保存します。

ブラウザは初期無効、キー保存と接続確認、有効化、固定バージョンの取り込み、Madoへのリンク、START/COMPLETEの配送、無効化時の操作非表示、日英と幅320pxを確認します。運用者が用意する実RegistryのDBで同じRunやDatasetVersionが増えないことは、このfixtureでは確認しません。

## Lineageの画面操作を確認する

Webを起動し、次を実行します。API応答には検証用のグラフを使います。

```bash
MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
MMT_CHROMIUM_PATH=/path/to/chrome \
MMT_WEB_URL=http://127.0.0.1:5182 \
MMT_SCREENSHOT_DIR=artifacts/lineage/<日付> \
node apps/web/tests/browser-lineage.mjs
```

全種類・関係の描画、拡大縮小・全体表示・移動・全体図、検索・方向別の経路、詳細へのリンク、focus付きURL、言語切替時の入力/選択保持と再取得の抑止、320pxと日英・テーマ、モデル詳細の学習元、閲覧者の操作と新たな書き込みが無いことを確認します。結果は`browser-result.json`と画像に残します。既存モデル画面の操作と閲覧権限は`browser-model-pipeline.mjs`でも確認します。
