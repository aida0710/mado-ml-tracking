---
title: SSH・Localのコンピュータ
description: Jobを実行するGPUマシンをコンピュータとして登録する。「接続」と「接続後の設定」の2段の追加、GPUの指定、Docker・Singularity・Apptainerの準備と、workerによる接続確認。
---

# SSH・Localのコンピュータ

![プロジェクトの使えるコンピュータ。自分が使えるコンピュータの一覧とWorkers](/images/compute-targets.png)

コンピュータは、Jobを実行するマシンの登録です。コンピュータのうち、SSHとLocalのものを指します。SSHの接続先、使えるGPU、対応するRuntime（Python、Docker、Singularity、Apptainer）、作業ディレクトリを登録します。コンピュータへの接続とJobの実行はworkerが行い、API serverはコンピュータへ接続しません。

コンピュータは全体設定の「コンピュータ」で足し、公開範囲（PublicかPrivate）で誰のJobが動くかを決めます。公開範囲と所有者の考え方は[コンピュータと公開範囲](/compute/computers)を参照してください。

```text
API server ← worker（SSH鍵・known_hostsを持つ） → Compute target（GPUマシン）
```

## こんなときに向いています

- 研究室や社内のGPUマシンで、Taskや自動実行のJobを動かしたい
- GPUを1枚ずつ予約して、Job同士が同じGPUを取り合わないようにしたい
- 依存関係をDockerイメージやSIFファイルに固めて動かしたい
- 最初のJobを流す前に、SSH、Python、Docker、GPUが使えるかをまとめて確かめたい

## コンピュータを用意する

ここではUbuntuのGPUマシンをコンピュータにする例で説明します。コンピュータのマシンでターミナルを開き、次を実行します。

### PythonとGitを入れる

コンピュータには、workerが送るsupervisor用にPython 3.11以上が必要です。Python runtimeでは、Jobごとにvenvを作って依存パッケージを入れます。

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip git
python3 --version
```

`python3 --version`が3.11未満なら、3.11以上のPythonを別に入れて、そのパスをコンピュータの［Python実行パス］に指定します。

### Dockerを使う場合

```bash
sudo apt-get install -y docker.io
sudo usermod -aG docker "$USER"   # SSHで接続するユーザーをdockerグループに入れる
```

グループの変更は、次にログインしたときから有効になります。SSHでログインし直して`docker version`を実行し、ServerのVersionまで表示されることを確かめます。

- workerは`--network host`でコンテナを起動します。コンテナ内から`127.0.0.1`へ接続すると、コンピュータ自身を指します。
- 読み取り専用のmountにLinux kernel 5.12以上が必要です。`uname -r`で確かめます。
- rootless DockerとUser namespaceのremapでは確認していません。

GPUをDockerで使う場合は、NVIDIAドライバに加えてNVIDIA Container Toolkitを入れます。

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Apptainerを使う場合

```bash
sudo add-apt-repository -y ppa:apptainer/ppa
sudo apt-get update
sudo apt-get install -y apptainer
apptainer --version
```

SingularityとApptainerは、`exec`の`--cleanenv`、`--containall`、`--no-home`、`--no-mount`、`--no-eval`、`--pwd`と、GPU用の`--nv`に対応したバージョンが必要です。古いバージョンでは接続確認でNGになります。

### workerからSSHで入れるようにする

SSHの秘密鍵とknown_hostsは、workerを動かすマシンに置きます。コンピュータの登録には、そのファイルのパスだけを入力します。workerのマシンでターミナルを開き、次を実行します。`gpu-host-1.example.internal`と`mmt`は、コンピュータのホスト名とSSHユーザーに置き換えてください。

```bash
ssh-keygen -t ed25519 -f ~/.ssh/mmt_worker_ed25519 -N ''
chmod 600 ~/.ssh/mmt_worker_ed25519
ssh-copy-id -i ~/.ssh/mmt_worker_ed25519.pub mmt@gpu-host-1.example.internal
ssh-keyscan -p 22 gpu-host-1.example.internal > ~/.ssh/mmt_known_hosts
ssh-keygen -lf ~/.ssh/mmt_known_hosts
```

最後のコマンドで表示されたフィンガープリントを、コンピュータで`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`を実行した結果と比べ、一致することを確かめてください。workerは未知のホスト鍵や変わったホスト鍵を受け入れません（`StrictHostKeyChecking=yes`）。

鍵とknown_hostsを`~/.ssh`に置くと、コンピュータを登録するときに［SSH鍵のパス］［known_hostsのパス］の候補に出ます。`~/.ssh`以外に置く場合は、workerの`MMT_WORKER_SSH_DIR`にそのディレクトリを指定します（[SSH鍵の候補を報告する](/compute/worker#ssh-key-candidates)）。

## コンピュータを登録する {#register-a-target}

SSH・Localのコンピュータを足せるのは全体管理者です。足した人がそのコンピュータの所有者になり、設定を変えられるのは所有者と全体管理者です。研究者が自分で足せるのは、外部のコンピュータ（site）だけです（[外部のコンピュータ（site）](/compute/sites)）。

［コンピュータを追加］のダイアログは2段に分かれています。

1. 「接続」: 接続先と、接続を確かめるworkerを選びます。［接続を確認して次へ］で、そのworkerがコンピュータへ入って調べます。
2. 「接続後の設定」: 確認の結果から、Python、CPUアーキテクチャ、Runtime、GPU、同時実行数が入った状態で開きます。作業ディレクトリを選び、値を直して保存します。

先にworkerを1台動かしておきます（[workerの導入と常駐](/compute/worker)）。1段目で選べるのは、オンラインのworkerだけです。

### 1段目: 接続 {#step-1-connection}

![［コンピュータを追加］の1段目「接続」。SSHの接続先と、接続に使うworker](/images/compute-target-dialog.png)

1. 右上のユーザーメニューの［全体設定］から、サイドバーの［コンピュータ］を開きます（`/settings/computers`）。
2. ［コンピュータを追加］を押します。
3. 次の項目を入力します。

| 項目 | 入力例 | 内容 |
| --- | --- | --- |
| 名前 | `gpu-host-1` | 画面とTaskの選択肢に表示する名前 |
| 種類 | SSH | 通常はSSH（既定）です。Local（開発専用）は開発モードでだけ出ます。Siteを選ぶと、siteの1枚の画面に変わります（[外部のコンピュータ（site）](/compute/sites)） |
| 公開範囲 | Public | Private（既定）では、所有者と、所有者が作ったService AccountのJobだけが動きます。どのProjectのJobも動かすならPublicにします（[公開範囲](/compute/computers#visibility)） |
| Host、Port | `gpu-host-1.example.internal`、`22` | コンピュータのSSHの接続先 |
| SSHユーザー | `mmt` | SSHで接続するユーザー |
| SSH鍵のパス | `/home/worker/.ssh/mmt_worker_ed25519` | workerのマシン上の秘密鍵のパス。選んだworkerのマシンにあるファイルが候補に出ます |
| known_hostsのパス | `/home/worker/.ssh/mmt_known_hosts` | workerのマシン上のknown_hostsのパス。候補はSSH鍵と同じです |
| 接続に使うworker | `lab-worker-1` | コンピュータへの接続を確かめるworker。オンラインのworkerが1台だけなら、選ばれた状態で開きます |

4. ［接続を確認して次へ］を押します。コンピュータを無効のまま登録し、選んだworkerに接続確認を頼みます。
5. 「workerが確認を始めるのを待っています…」「workerが接続を確認しています…」と進みます。workerがコンピュータへ入れると、自動で2段目に進みます。

Localでは、Hostからknown_hostsのパスまでのSSHの欄はありません。選んだworkerが、自分のホストの上でコマンドを起動して確かめます。

#### SSH鍵とknown_hostsのパスの候補

- 候補は、選んだworkerが自分のマシンの`~/.ssh`と`MMT_WORKER_SSH_DIR`の直下で見つけたファイルのパスです。workerはパスだけを報告し、鍵とknown_hostsの中身は送りません（[SSH鍵の候補を報告する](/compute/worker#ssh-key-candidates)）。
- 入力すると、候補が絞られます。候補に無いパスも、そのまま入力できます。
- workerを選ぶまでは、候補は出ません。

#### 接続に使うworker

- 出るのは、オンライン（最終応答から120秒以内）で、SSH鍵の候補を報告しているworkerだけです。workerの`MMT_WORKER_TARGET_IDS`に、このコンピュータが入っていなくてもかまいません。
- SSH鍵の候補の報告と、2段目のディレクトリの読み取りは、新しい版のworkerだけが行います。動いているworkerがここに出ないときは、`mado-tracking-worker upgrade`で更新します（[更新する](/compute/worker#upgrade)）。古い版のworkerも、これまでどおりJobを処理し、担当するコンピュータの接続確認を受け取ります。
- オンラインのworkerが無いときは、「接続を確かめられるworkerがオンラインにありません。」と出て、［接続を確認して次へ］は押せません。workerを起動して［workerを読み直す］を押すか、［確認せずに次へ］で手で入力します。
- 選べるのは全体管理者だけです。

#### 接続を確認できなかったとき

確認できないと、1段目のまま理由が出ます。

| 表示 | 原因と対処 |
| --- | --- |
| 選んだworkerが確認を受け取りませんでした | workerが5分以内に確認を受け取りませんでした。workerが動いているかを確かめます |
| workerから結果が届きませんでした | workerが確認の途中で止まりました。workerのログを確かめます |
| 接続を確認できませんでした | 項目ごとの結果が出ます。SSH接続がNGなら、表の［対処］を見て接続の欄を直し、もう一度［接続を確認して次へ］を押します（[確認が終わらないとき](#when-the-check-does-not-finish)） |

接続を直さずに進めるときは、［確認せずに次へ］を押します。2段目は候補の無い状態で開くので、作業ディレクトリとPython実行パスを手で入力します。

どちらのボタンを押しても、1段目を終えた時点でコンピュータは無効のまま登録されています。ダイアログを閉じても一覧に残るので、あとから［コンピュータを編集］で続きを入力できます。

### 2段目: 接続後の設定 {#step-2-settings}

![2段目「接続後の設定」。確認の結果から入った値と、workerが読んだ/data/の中身からの補完](/images/compute-target-setup.png)

上に確認の結果（「接続を確認しました」と、CPUアーキテクチャ・コア数・メモリ）が出ます。［確認の詳細］を開くと、項目ごとの結果を見られます。

| 項目 | 入力例 | 内容 |
| --- | --- | --- |
| 作業ディレクトリ | `/data/mmt-jobs` | コンピュータ上でJobのファイルとデータセットのcacheを置く場所。SSHユーザーが書き込めるディレクトリ。自動では入らないので、候補から選ぶか入力します |
| Python実行パス | `/usr/bin/python3` | コンピュータ上のPython 3.11以上。確認で見つかった3.11以上のPythonが入ります |
| CPUアーキテクチャ | amd64 | 確認の結果（`x86_64`はamd64、`aarch64`はarm64）が入ります。対応しない値だったときは、選び直します |
| 対応Runtime | Python、Docker | このコンピュータで動かせるRuntime。確認で動いたものが選ばれています |
| GPU（見つかったもの） | `0`、`1` | 確認で見つかったGPU。全部にチェックが入っています |
| GPU ID（1行に1件） | `0`<br>`1` | Jobに割り当ててよいGPUの番号。チェックしたGPUが入ります。空ならCPUだけのコンピュータ |
| 同時実行数 | `2` | このコンピュータで同時に動かすJobの上限。既定は選んだGPUの数（GPUが無ければ1）です |
| データセットの転送 | workerが中継する | 入力データセットの取得方法（後述） |
| データセットのcache上限（GiB） | `100` | コンピュータ上のデータセットのcacheの上限 |
| 有効 | オン | 有効にすると、このコンピュータでJobが動き始めます |

入力した値はどれも直せます。［保存］を押すと、接続後の設定を保存し、［有効］がオンならコンピュータを有効にします。一覧の下に、そのコンピュータの詳細が開きます。［戻る］を押すと1段目に戻ります。

［有効］をオフにして保存すると、無効のまま登録します。このときは作業ディレクトリとPython実行パスが空でもかまいません。有効にするときに、この2つが必要です。

#### 作業ディレクトリとPythonのパスを補完する

- 作業ディレクトリの候補には、確認で見つかった場所（ホーム、`/data`のようなマウント、`/work`・`/scratch`などのうち在るもの、ホーム直下のディレクトリ）が、書き込めるかと空き容量つきで出ます。Python実行パスの候補には、確認で見つかったPythonがバージョンつきで出ます。どちらも入力に合わせて絞られます。
- 候補に無い場所は、`/data/`のように`/`で終わるところまで入力すると、workerがそのディレクトリの中を読み、候補に足します。Python実行パスでは、実行できるファイルも出ます。隠しディレクトリは、`.`まで入力すると出ます。
- workerが読み取りを受け取るまで、数秒かかります。その間は「workerがディレクトリを読んでいます…」と出ます。読めないときは、「このディレクトリはありません」「このディレクトリは読めません（権限がありません）」「workerが接続できませんでした」などの理由が欄の下に出ます。
- 読んだ結果は、ダイアログを開いている間だけ覚えています。読むのは名前と種類だけで、ファイルの中身は読みません。

#### GPUを選ぶ

![2段目の下の方。見つかったGPU、手入力のGPU ID、同時実行数](/images/compute-target-setup-gpus.png)

確認で見つかったGPUは、チェックの一覧に出ます。Jobに使わせないGPUは、チェックを外します。チェックしたGPUが［GPU ID（1行に1件）］に入り、［同時実行数］は手で変えるまで、選んだGPUの数に合わせて変わります。

ログインノードに接続してジョブを出す場合のように、確認したマシンとJobが動くマシンが違うときは、一覧のGPUはJobが動くマシンのものとは限りません。そのときは［GPU ID（1行に1件）］に、Jobが動くマシンのGPUの番号を手で入力します。

接続先や鍵のパスなどの接続情報は、所有者と全体管理者にだけ表示します。

### GPUの割り当て

Taskや自動実行ルールでGPU IDを選ぶと、そのJobの間はアプリ内でそのGPUを予約し、ほかのJobに割り当てません。選ばなければCPUだけで実行します。

- Dockerでは、予約したGPUだけを`--gpus device=...`で渡します。コンテナ内のCUDAの番号は`0`から振り直されます。
- SingularityとApptainerでは`--nv`と`CUDA_VISIBLE_DEVICES`で、CUDAから見えるGPUを予約したものに絞ります。デバイス自体の分離ではありません。
- 予約はこのアプリのJob同士の排他です。ほかの人がSSHで直接使うGPUや、別のジョブスケジューラーが使うGPUまでは防げません。共有のマシンでは、このアプリ専用のGPUと作業ディレクトリを決めて登録してください。
- 状態が確認できないJobのGPUは、自動で解放しません。

### 入力データセットの転送

| データセットの転送 | 動作 | 向いている場面 |
| --- | --- | --- |
| workerが中継する（既定） | workerがAPIから取得し、1本のtarでコンピュータへ送ります | GPUマシンからAPI serverへ直接届かない |
| コンピュータがAPIから直接取得する | コンピュータがJob限定tokenでAPIから取得します | コンピュータからAPIへ届き、workerを経由すると遅い |

取得したデータセットは、作業ディレクトリの`.mmt-cache/datasets/`に置き、同じバージョンを次のJobでも使います。cacheが上限を超えると、最後に使ったのが古いものから消します。実行中のJobが使っているものは消しません。データセットバージョンの詳細は[データセット](/data/datasets)を参照してください。

### コンピュータの変更と無効化

全体設定の「コンピュータ」の一覧で、［コンピュータを編集］を押して設定を変えます。変えられるのは所有者と全体管理者です。待機中・実行中のJobが参照しているあいだは、接続先、Runtime、GPU、データセットの設定を変更できません。Jobが終わってから保存してください。

SSH・Localの編集のダイアログは、追加のときの2段を「接続」「接続後の設定」のタブで切り替えます。［保存］は、両方のタブの変更をまとめて保存します。

- ［再確認］を押すと、［接続に使うworker］で選んだworkerがもう一度接続を確かめ、作業ディレクトリ・Python・CPUアーキテクチャ・GPUの候補を新しくします。入力済みの値は変わりません。
- 接続の欄を変えてから［再確認］を押すと、確認の前に接続の項目だけを保存します（「保存していない接続の変更は、確認の前に保存します。」）。
- ［接続に使うworker］には、前回の確認に使ったworkerがオンラインなら、そのworkerが選ばれています。
- 作業ディレクトリとPython実行パスは、追加の2段目と同じように補完できます。

一覧の［無効にする］を押すか、編集の［有効］のチェックを外すと、新しいJobの割り当て先から外れます。実行中のJobは、workerが引き続き管理します。

## 接続を確認する {#check-the-connection}

![接続確認の結果（見本のLocalのコンピュータ）](/images/compute-target-check.png)

接続確認は、追加の1段目の［接続を確認して次へ］と、編集の［再確認］のほか、全体設定の「コンピュータ」の詳細でも行えます。設定を変えたあとや、Jobが失敗するときに、コンピュータの準備ができているかを確かめ直します。確認はworkerが自分のSSH鍵で行い、API serverはコンピュータへ接続しません。接続確認は、所有者と全体管理者が行えます。

1. 全体設定の「コンピュータ」の一覧で、コンピュータの行の［接続確認を開く］を押します。一覧の下に、コンピュータの詳細と［接続確認］の欄が開きます。
2. 欄の右上の［接続を確認］を押します。workerが確認を受け取ると、状態が変わります。
3. 項目ごとの結果を確かめます。NGの項目は［対処］の欄に直し方を表示します。

詳細の［接続を確認］では、前回の確認に使ったworkerがもう一度確かめます。前回の確認でworkerを選んでいないコンピュータは、そのコンピュータを担当するworker（`MMT_WORKER_TARGET_IDS`にコンピュータのIDを含むもの）が確かめます。

確認する項目は次のとおりです。

| 項目 | 確かめること |
| --- | --- |
| SSH接続 | 鍵とknown_hostsでコンピュータへ接続できるか |
| Python | ［Python実行パス］のPythonが3.11以上か。まだ入力していないとき（追加の1段目）は、見つかった3.11以上のPythonで確かめます |
| venv、pip | Jobごとのvenvを作り、パッケージを入れられるか |
| git | Gitのソースを取得できるか |
| Docker | CLIがあり、daemonに接続できるか。権限が無いのか、daemonが止まっているのかを分けて表示します |
| Apptainer、Singularity | CLIがあり、必要なオプションに対応しているか |
| GPU（nvidia-smi） | `nvidia-smi`が報告するGPUのindex、名前、メモリ |
| 作業ディレクトリ | SSHユーザーが書き込めるか、空き容量。まだ入力していないとき（追加の1段目）は［未確認］になります |
| APIへの到達 | コンピュータからAPI serverへ届くか |

Localのコンピュータでは、最初の項目が「SSH接続」の代わりに「コマンドの起動」になります。

結果の［OK］は使えること、［NG］はそのままではJobが失敗すること、［なし］はRuntimeやGitのような任意の道具が入っていないこと、［未確認］は確かめなかったことを表します。

確認では、2段目の候補にするために、マシン（CPUアーキテクチャ、コア数、メモリ、ホームディレクトリ）、Pythonの候補、作業ディレクトリの候補も調べます。詳細の［マシン］の欄に、CPUアーキテクチャ・コア数・メモリが出ます。

確認で見つかったGPUとRuntimeは、詳細の［設定の候補］に表示します。候補を選んで［選んだ候補を保存］を押したときだけ、コンピュータの［GPU ID］と［対応Runtime］が変わります。編集のダイアログで変えることもできます。

確認はコンピュータに何も残しません。作業ディレクトリも作りません。

### 確認が終わらないとき {#when-the-check-does-not-finish}

| 表示 | 原因と対処 |
| --- | --- |
| 選んだworkerが確認を受け取りませんでした、5分以内にclaimしたworkerがありません | 確認を頼んだworkerが動いていません。プロジェクトの使えるコンピュータの［Workers］で、workerが「オンライン」かを確かめます。workerを選んでいない確認では、workerの`MMT_WORKER_TARGET_IDS`（`install`の`--target-ids`）にコンピュータのIDが入っているかも確かめます |
| workerから結果が届きませんでした | workerが確認の途中で止まりました。workerのログを確かめます |
| SSH接続がNG（鍵の権限） | workerのマシンに鍵かknown_hostsが無いか、鍵の権限が600ではありません。workerのマシンで`mado-tracking-worker doctor`を実行して確かめます |
| SSH接続がNG（接続できない） | Host・Port・SSHユーザーが合っているか、鍵の公開鍵がコンピュータの`~/.ssh/authorized_keys`にあるか、known_hostsにコンピュータのホスト鍵があるかを確かめます |
| APIへの到達がNG | コンピュータからworkerの`MMT_API_URL`へ届きません。Jobの記録に必要なので、経路とURLを見直します |

`MMT_WORKER_TARGET_IDS`を設定していないworkerも、［接続に使うworker］で選べば、接続確認とディレクトリの読み取りを受け取ります。workerを選んでいない確認（以前の画面やAPIから頼んだもの）を受け取るのは、`MMT_WORKER_TARGET_IDS`にそのコンピュータを含むworkerだけです。

## Workersを見る

プロジェクトの［使えるコンピュータ］には、このProjectで自分が使えるコンピュータの一覧（読むだけ）と［Workers］が出ます。［Workers］には、このProjectに接続しているworkerの接続状態、バージョン、ホスト名、最終応答、担当Job数を表示します。120秒以上応答が無いworkerは「オフライン」になります。workerの導入は[workerの導入と常駐](/compute/worker)を参照してください。

## 権限

| 操作 | 必要な権限 |
| --- | --- |
| 全体設定の「コンピュータ」ですべてのコンピュータを見る | ログインしている人（使えないものは名前・種類・所有者・公開範囲・状態だけ） |
| プロジェクトの使えるコンピュータとWorkersを見る | viewer以上 |
| SSH・Localのコンピュータを足す | 全体管理者 |
| コンピュータの変更・公開範囲の変更・有効と無効の切り替え、接続確認 | 所有者か全体管理者 |
| 追加・編集の［接続に使うworker］でworkerを選ぶ（SSH鍵の候補とディレクトリの読み取りを含む） | 全体管理者 |
| コンピュータでJobを動かす | Publicは誰でも。Privateは所有者と、所有者が作ったService Account |
| 外部のコンピュータ（site）の登録・変更 | 誰でも足せます。変更は所有者か全体管理者（[外部のコンピュータ（site）](/compute/sites)） |
