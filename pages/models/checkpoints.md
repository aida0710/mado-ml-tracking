---
title: 学習の継続とデータの追加
description: 事前学習の途中でデータセットを追加した履歴を残し、checkpointから新しいRunで学習を続ける。
---

# 学習の継続とデータの追加

長い学習が途中で止まっても、保存したcheckpointから新しいRunとして続きを回せます。元のRunは変更せず、失敗や中止の記録として残ります。再開は手動で行います。自動実行の再試行では、checkpointから再開せず最初からやり直します。

## 事前学習の途中でデータを追加する {#training-data-stages}

同じRunのまま学習データを追加したときは、［学習データの履歴］タブの［データの変更を記録］で、使い始めたstepと、そのstep以降のデータセットの全構成を登録します。画面には開始時の構成、追加したデータ、外したデータが並びます。元の入力設定を上書きしません。

学習コードからも記録できます。先にデータ読み込みを切り替え、その構成をSDKへ渡します。記録しただけで実行中のデータ読み込みが切り替わるものではありません。

```python
# 1000stepまで学習した後、読み込み側に合成データを追加した例。
run.log_training_data_stage(
    start_step=1001,
    input_dataset_version_ids=[original_dataset_version_id, synthetic_dataset_version_id],
    checkpoint_id=checkpoint["id"],  # このRunがstep 1000で保存したcheckpoint。省略も可能。
    metadata={"note": "事前学習に合成データを追加"},
)
```

引き続き使うデータも含めて、全構成を渡してください。データセットの版とstepは固定され、同じ内容の再送は同じ記録を返します。Jobが終了した後に履歴を追加することはできません。オンライン接続で利用できます。

## checkpointから構成を変えて学習を続ける

完了済みの学習のcheckpointからも、新しいRunで学習を続けられます。元のRunにJobがなくても利用できます。

1. Runの［Checkpoint］タブで［この重みから学習を続ける］を押します。
2. checkpointの時点のデータ構成が選ばれていることを確認し、追加するデータセットの版を選びます。
3. 学習設定と実行先を確認し、［ジョブを起動］を押します。

新しいRunには元のRunとcheckpoint、今回使うデータの版が記録されます。元の実行種別を引き継ぐため、事前学習は事前学習として継続します。元のCodeと同じCodeの別バージョンを選ぶこともできます。重みの読み込みは学習コードの`run.resume_checkpoint()`で行います。

## こんなときに向いています

- GPUマシンの再起動やメモリ不足で、数時間の学習が途中で止まった
- 学習を一度中止して、パラメータは同じまま後で続けたい
- どのcheckpointから再開したかを、Runの記録として残したい

## 学習コードでcheckpointを保存する

Python SDKの`run.log_checkpoint()`でディレクトリを保存します。再開したRunでは`run.resume_checkpoint()`が再開元の情報を返します。

```python
from mado_tracking import start_run

TOTAL_STEPS = 1000
CHECKPOINT_EVERY = 100

with start_run(kind="training", parameters={"steps": TOTAL_STEPS}) as run:
    checkpoint = run.resume_checkpoint()  # 再開でなければNone
    if checkpoint is not None:
        state = load(checkpoint.path)  # 読み取り専用のディレクトリ
        start_step = checkpoint.step
    else:
        state, start_step = initial_state(), 0
    for step in range(start_step, TOTAL_STEPS):
        loss = train_one_step(state)
        run.log_metrics({"train.loss": loss}, step=step)
        if (step + 1) % CHECKPOINT_EVERY == 0:
            save(state, "ckpt")  # 重み、optimizerの状態、乱数の状態など
            run.log_checkpoint("ckpt", step=step + 1, includes_optimizer=True, framework="torch")
```

- `log_checkpoint()`はディレクトリを1つのtarにまとめ、RunのArtifact`checkpoints/step-<step>.tar`へ送ります。各ファイルのパス、SHA-256、サイズも一緒に登録します。
- `step`は「そこまでに終えたstep数」にします。再開側が`range(checkpoint.step, TOTAL_STEPS)`でそのまま続けられます。
- 再開した後も、メトリクスのstepは続きの値で記録してください。0から数え直さないことで、グラフが1本につながります。
- シンボリックリンクを含むディレクトリと空のディレクトリは保存できません。同じRunで同じstepを2回保存すると拒否します。

MLflow 3 SDKで`mlflow.log_artifacts("ckpt", "checkpoints/step-100")`のように`checkpoints/step-<整数>/`の下へ保存したファイルも、学習とファインチューニングのRunなら自動でcheckpointになります。

## 保存したcheckpointを見る

Run詳細の［Checkpoint］タブに、そのRunのcheckpointをstep、ファイル数、optimizerの状態を含むか、frameworkと一緒に表示します。

一覧には、Runごとに新しい順で5件を表示します（API serverの`MMT_CHECKPOINT_KEEP_COUNT`で変更できます）。古いものは［保持数を超えた古いcheckpointも表示する］を選ぶと表示されます。一覧から外れても、Artifactは消えないので再開に使えます。

## 停止したJobを同じ条件で再開する

再開できるのは、Jobで実行して失敗または中止したRunです。再開はそのJobの再実行なので、できるのはRunの作成者とProjectのAdminだけです（Jobの停止・再実行と同じ）。ほかの人の［Checkpoint］タブには、［このcheckpointから再開］の代わりにその理由が出ます。

### checkpointを選んで再開する

1. 止まったRunを開き、［Checkpoint］タブを選びます。
2. 再開したいcheckpointの行で［このcheckpointから再開］を押します。
3. 確認で「step Nのcheckpointから、新しいRunとして学習を再開します。」と表示されたら、［新しいRunで再開］を押します。
4. 新しいRunが作られ、JobsにそのJobが「再開」の印付きで表示されたことを確かめます。

### 最新のcheckpointから再開する

Jobsで失敗・中止したJobの行の［最新checkpointから再開］を押すと、そのRunで保存したstepが最大のcheckpointから再開します。そのRunにcheckpointが無く、Run自体が再開したRunの場合は、その再開元のcheckpointを引き継ぎます。

### 再開できる条件

- checkpointと同じProjectのRun
- 元のRunと同じ実行種別（学習またはファインチューニング）
- 元のRunと同じコード。コードのバージョンは違っていてもかまいません

新しいRunには、再開元のcheckpointと、親Run（元のRun）が記録されます。Jobを作った後は変更できません。

## workerが行うこと

workerは、実行コードを起動する前にcheckpointを取得し、内容を確かめます。

1. checkpointのArtifactを取得し、SHA-256とサイズを照合します。接続が切れても、途中から取得し直します。
2. tarの中身が登録した一覧と完全に一致することを確かめます。余分なファイル、足りないファイル、`..`やシンボリックリンクがあれば中止します。
3. 実行先の作業ディレクトリに、読み取り専用で展開します。
4. 実行コードに次の環境変数を渡します。

| 環境変数 | 内容 |
| --- | --- |
| `MMT_RESUME_CHECKPOINT_DIR` | 展開したディレクトリ。コンテナでは`/mmt/inputs/checkpoint` |
| `MMT_RESUME_STEP` | 再開するstep |
| `MMT_RESUME_CHECKPOINT_FILE` | 再開元の情報（`resume-checkpoint.json`）のパス |

照合に失敗したときは実行コードを起動せず、Jobを失敗にします。理由はJobのエラーに「Checkpoint ... mismatch」のように残ります。

## 手元で途中失敗と再開を試す

リポジトリの`python/examples/training.py`は、`--fail-at-step`で途中で失敗し、checkpointから再開できるサンプルです。APIに接続せずに試せます。リポジトリのルートで、[workerの導入と常駐](/compute/worker#install-the-worker)の手順でvenvを作ってから実行します。

```bash
python/.venv/bin/python python/examples/training.py --offline --steps 40 --checkpoint-every 10 \
  --fail-at-step 27 --output /tmp/mmt-ckpt/weights.json
echo '{"checkpointId":"local","sourceRunId":"local","step":20}' > /tmp/mmt-ckpt/resume.json
MMT_RESUME_CHECKPOINT_DIR=/tmp/mmt-ckpt/checkpoints/step-20 MMT_RESUME_STEP=20 \
MMT_RESUME_CHECKPOINT_FILE=/tmp/mmt-ckpt/resume.json \
  python/.venv/bin/python python/examples/training.py --offline --steps 40 --checkpoint-every 10 \
  --output /tmp/mmt-ckpt/resumed.json
```

1回目はstep 27で失敗し、`/tmp/mmt-ckpt/checkpoints/`に`step-10`と`step-20`が残ります。2回目はstep 20から続け、最後まで学習します。

## checkpointの容量

checkpointのArtifactは、一覧から外れても自動では消しません。容量を空けるときは、不要なcheckpointのArtifactを削除します（[Artifacts](/data/artifacts)）。削除できるのはProject adminだけです。一覧に表示しているcheckpoint（保持数以内のもの）と、再開元になったcheckpointのArtifactは削除できません。
