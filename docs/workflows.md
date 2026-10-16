# 前処理・学習・評価のワークフロー

Workflowsは、Taskを順番に実行し、各ステップの条件と実際の入出力を記録する機能です。保存時点のTaskの設定をワークフローのバージョンに固定します。Taskを後から編集しても、保存したワークフローや過去の実行は変わりません。

## Data Catalogとの役割分担

| 管理する内容 | Mado Data Catalog | ML Tracking |
| --- | --- | --- |
| データの出自、処理履歴、保管先 | データ全体をたどる | Runの入力・出力を記録する |
| 前処理のコードと条件 | 連携した実行履歴を参照する | コードバージョン、Taskの設定、実行先を固定する |
| 前処理の品質 | データの属性として利用する | 件数、時間、除外理由、品質値、サンプルを記録する |
| 学習での使い方 | データのバージョンを提供する | 用途、混合比率の重み、抽出条件を記録する |
| モデルまでのつながり | 連携したデータの流れをたどる | 前処理→学習→評価のRunと成果物をたどる |

ML Trackingの入出力の関係もデータリネージです。Data Catalogの管理対象を複製せず、同じデータセットバージョンを参照して学習側の実行条件を記録します。Madoとの同期には既存のDataset/Runイベントを使います。

## 定義と実行

1. 前処理、学習、評価のTaskを作り、それぞれの実行先を指定します。
2. WorkflowsでTaskを実行順に並べます。上限は10ステップです。
3. 入力には固定したデータセットバージョン、または前のステップの出力を指定します。出力データセット名が空なら、そのステップの出力をすべて使います。
4. 用途を前処理の入力・学習・検証・テストから選び、重みと抽出条件を保存します。
5. 必要なら、次へ進むための品質条件を設定します。メトリクスがない場合も停止します。
6. 保存したバージョンを選んで実行します。各ステップに通常のRunとJobを作ります。

入力データはワークフローで明示します。WebでTaskを選ぶと、Taskの既定の入力を初期値として取り込みます。APIでは`inputs`が空なら、そのステップのデータ入力も空になります。入力モデルはTaskの固定したモデル、または前のステップの出力モデルを使います。引き継ぐ出力モデルは一つ必要です。

重みと抽出条件は実行コードへの指示です。ワークフロー自体は抽出やサンプリングを行いません。コードは`MMT_DATASET_USAGE_FILE`にある`{ "items": [...] }`を読み、指定した用途と条件でデータを使います。Python・Docker・Apptainerで同じ情報を渡します。`MMT_JOB_CONTEXT_FILE`にはワークフローの実行ID、バージョンID、ステップのキーも入ります。

前処理が`result.json`の`datasets.path`で出力したファイルは、ファイル一覧を持つデータセットバージョンになります。`path`にディレクトリを書くと、その下の出力ファイルすべて（数千の音声など）が1つのバージョンになり、パスはそのディレクトリからの相対パスになります（[worker](worker.md)の「result.json version 2」）。後続のworkerが同じファイルを取得し、`MMT_INPUT_DATASET_DIRS`から読めます。元のRunの入力バージョンも親バージョンとして残します。

各ステップのRunの親（workerが上流Runとして`MMT_UPSTREAM_RUN_ID`と`upstream-run.json`で渡すRun）は、そのステップが出力データセットを読む前のステップのうち、最も近いステップのRunです。データセットを読まずにモデルだけを受け取るステップでは、モデルを出したステップのRunが親です。固定のデータセットとモデルだけを使うステップには親がありません。たとえば「前処理→学習→評価」で、評価が前処理の出力と学習のモデルを使うと、評価の親は前処理のRunになります。

ステップのJobは、用途と条件を実行コードへ渡せるworker（claimの`workerInfo.capabilities`に`workflowDatasetUsage`を含むもの）だけが受け取ります。対応する機能を報告するworkerがいなければ、ワークフローのJobは待機したままになります。siteでは、launcherと`mado-tracking submit`がclaimの`capabilities`で、siteに置くrunnerの機能を名乗ります。`capabilities`は省略できません（[sites](sites.md)の「runner」）。ワークフローのステップのJobには`MMT_WORKFLOW_EXECUTION_ID`（実行のID）も渡します。

## 前処理レポート

前処理コードから、終了前にレポートを保存します。レポートを保存できるのは`processing`（データ処理）のRunだけです。ワークフローのステップ（データ処理のTaskのJob）の中では、引数なしの`start_run()`がworkerの作ったprocessingのRunをそのまま返します（`name=`を渡すと、workerのRunを使わずに新しいRunを作ろうとします）。Jobの外で試すときは、新しいRunを作るので、Experimentの名前`experiment_name=`、Runの名前`name=`、`kind="processing"`を指定してください。

```python
import mado_tracking

# Jobの外で試す例。Jobの中では引数なしの start_run() を使う
run = mado_tracking.start_run(
    experiment_name="speech-preprocessing",
    name="preprocessing-trial",
    kind="processing",
)
run.log_preprocessing_report(
    input_count=1000,
    output_count=940,
    excluded_count=50,
    failed_count=10,
    input_duration_seconds=3600,
    output_duration_seconds=3300,
    exclusions=[{"reason": "短い音声", "count": 50}],
    failures=[{"reason": "デコード失敗", "count": 10}],
    metrics={"snr_mean": 21.5},
    sample_artifact_ids=[],
)
```

除外・失敗の合計は入力件数以下にし、理由別の件数はそれぞれの合計に合わせます。分割する処理では出力件数が入力件数を超えても構いません。サンプルには、このRunが保存したArtifactのIDを指定します。参照中のサンプルは削除できません。

同じレポートの再送はバージョンを増やしません。終了後は内容を変更できません。SDKからのレポート送信はオンラインのRunに対応します。

集計値は`preprocessing.input_count`、`output_count`、`excluded_count`、`failed_count`、`input_duration_seconds`、`output_duration_seconds`としてRunのメトリクスに記録します。すべて`preprocessing.`を付けます。`preprocessing.retained_input_ratio`は`(入力−除外−失敗)/入力`で、入力が0件なら未定義です。品質条件は最新のレポートで判定し、以前のレポートの値では補いません。独自の品質値には`preprocessing.*`以外の名前を使ってください。

## 停止と再開

Jobの失敗、必要な出力の欠落、品質条件の不一致、実行した利用者の権限喪失が起きると、後続のステップを停止して理由を残します。停止操作では、実行中のJobに停止を依頼し、Jobが終了するまで「停止要求済み」と表示します（状態は`canceling`）。

失敗・中止した実行は、同じバージョンで新しい実行として再開できます。成功した先頭のステップはRunと出力をそのまま再利用し、最初の未完了ステップから再実行します。元の実行履歴は残ります。条件を変える場合は新しいバージョンを作り、最初から実行してください。ステップ単体のJob retryは使いません（`409 workflow_retry_required`）。停止と再開ができるのは、元の実行の作成者とProject adminだけです（ほかのeditorは`403 workflow_control_forbidden`）。Webでは、実行・再開・停止のどれも確認を挟みます。

起動APIには`idempotencyKey`を指定します。同じ利用者が同じワークフローへ同じキーを再送すると、最初の実行を返します。バージョンや再開元を変えて同じキーを使うと409です。APIの再起動後も、保存したRunの状態から次のステップを進めます。

## SDKからの起動

```python
from mado_tracking import Client

with Client() as client:
    execution = client.launch_workflow(
        project_id, workflow_id,
        revision=1,
        idempotency_key="speech-preparation-20261012",
    )
    status = client.get_workflow_execution(project_id, execution["id"])
```

定義の作成・バージョン追加・バージョンの一覧・実行履歴の取得・停止もClientから行えます。`get_workflow`は新しいバージョンから20件だけを返すので、すべてのバージョンは`list_workflow_versions`でたどります。詳細は[API契約](api-contract.md)と生成した[OpenAPI](openapi.json)を参照してください。
