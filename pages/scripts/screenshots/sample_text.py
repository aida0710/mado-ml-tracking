"""The names and texts of the sample data, in Japanese and English.

The Japanese text is the data the Japanese screenshots have always shown; the English text is its
translation. seed_sample_project.py picks one with --lang.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SampleText:
    """Every name and text of the sample data in one language."""

    project_name: str
    project_description: str
    local_account_name: str
    worker_account_description: str
    automation_account_description: str
    computer_name: str
    experiments: dict[str, tuple[str, str]]
    code_description: str
    code_names: dict[str, str]
    reference_dataset: tuple[str, str]
    inference_output_dataset: tuple[str, str]
    model_description: str
    inference_rule_name: str
    evaluation_rule_name: str
    promotion_policy_name: str
    output_model_note: str
    training_run_name: str
    audio_dataset_name: str
    audio_dataset_description: str
    audio_version_notes: tuple[str, str]
    data_run_name: str
    second_run_note: str
    first_run_note: str
    researcher_comment: str
    admin_reply: str
    version_comment: str
    deleted_comment: str
    saved_view_name: str
    live_chart_title: str
    snapshot_chart_title: str
    report_title: str
    report_intro: str
    report_sweep_heading: str
    report_comment: str
    notification_channel_name: str
    # (text in the file, text shown instead) for the sample code files, applied in order.
    source_replacements: dict[str, list[tuple[str, str]]]


JAPANESE = SampleText(
    project_name="音声モデル実験（見本）",
    project_description="音声合成モデルの学習→自動登録→推論→評価→昇格と、Sweep・レポートの見本",
    local_account_name="音声チーム（ローカルアカウント見本）",
    worker_account_description="確認用のCPU worker",
    automation_account_description="自動推論・評価・昇格の実行者",
    computer_name="見本 CPU（local）",
    experiments={
        "training": ("音声合成の学習", "学習Taskと自動推論・評価のRun"),
        "sweep": ("Sweep: 学習率とbatch size", "grid探索とhyperbandの早期打ち切り"),
        "data": ("データ準備", "音声データの整備"),
    },
    code_description="見本データ",
    code_names={
        "training": "音声合成 学習",
        "inference": "音声合成 推論",
        "evaluation": "音声長の評価",
        "sweep": "Sweep 試行",
    },
    reference_dataset=("評価用 正解の長さ", "推論WAVの期待される長さ"),
    inference_output_dataset=("推論出力の音声", "自動推論が出したWAV"),
    model_description="見本の音声合成モデル（CPUの線形モデル）",
    inference_rule_name="登録時に推論",
    evaluation_rule_name="推論のあとに評価",
    promotion_policy_name="production への昇格基準",
    output_model_note="見本",
    training_run_name="学習 {round_number}回目（{steps} step, lr {learning_rate}）",
    audio_dataset_name="合成母音コーパス（見本）",
    audio_dataset_description="16kHz monoの合成母音。manifest.jsonlに文字と話者",
    audio_version_notes=("3母音", "e・oを追加して5母音"),
    data_run_name="合成母音の生成",
    second_run_note=(
        "## 2回目の学習\n\n"
        "- 1回目（20 step, lr 0.05）より **長く・大きい学習率** で回した\n"
        "- `val.loss` は 30 step 付近でほぼ 0 に収束\n"
        "- 音声 `samples/tone` は step が進むほど 440 Hz に近づく（スライダーで聴き比べ）\n\n"
        "| 回 | step | lr |\n|---|---|---|\n| 1 | 20 | 0.05 |\n| 2 | 60 | 0.1 |\n"
    ),
    first_run_note="## 1回目の学習\n\n短めの学習。基準版として `production` に昇格した。",
    researcher_comment="val.loss の下がり方がきれい。2回目を本番候補にしたい",
    admin_reply="評価の判定も合格で、production が自動で切り替わりました",
    version_comment="基準版（1版目）より平均誤差が小さい",
    deleted_comment="（下書き）",
    saved_view_name="学習Runの比較（loss・accuracy）",
    live_chart_title="train.loss（live）",
    snapshot_chart_title="val.accuracy（固定）",
    report_title="音声合成モデル 2版の比較（見本）",
    report_intro=(
        "# 音声合成モデル 2版の比較\n\n"
        "学習Taskを2回流し、自動で版を登録→推論→評価→昇格判定まで進めた結果をまとめる。\n\n"
        "- 1版目: 20 step・lr 0.05（基準なしの初回として production へ）\n"
        "- 2版目: 60 step・lr 0.1（基準の1版目と比べて合格し、production を置き換え）"
    ),
    report_sweep_heading="## Sweep: 学習率と batch size\n\ngrid 3×2、hyperband で早期打ち切り。",
    report_comment="固定の図は保存時点のデータで描かれます",
    notification_channel_name="確認用webhook",
    source_replacements={
        "voice_training.py": [
            (
                '"""Sample training Job: fits a linear model (y = 2x + 1), logging metrics every step and '
                "audio,\nan image and a table along the way.\n\nThe weights have the format of training.py, "
                "which inference.py reads. They are saved to the\nartifactPath of the Task's output model "
                'setting, and the Task registers the version. The worker\nlogs system.*.\n"""',
                '"""見本用の学習Job: 線形モデル（y = 2x + 1）を学習し、'
                "stepごとの指標と音声・画像・表を記録する。\n\n"
                "推論（inference.py）が読む重みの形式は training.py と同じ。Taskの出力モデル設定の\n"
                'artifactPath に重みを保存し、版の登録はTaskに任せる。system.* はworkerが記録する。\n"""',
            ),
            (
                "# A prediction this close to the answer counts as correct (the definition of accuracy).",
                "# 予測と正解の差がこの範囲なら正解とみなす（accuracyの定義）。",
            ),
            (
                "# The tone approaches 440 Hz as val.loss falls, so the progress of training can be heard.",
                "# val.loss が小さいほど 440 Hz に近づく音にして、"
                "学習の進み具合を耳で確かめられるようにする。",
            ),
            (
                '"voice_training.py must run from a Task with an output model setting"',
                '"voice_training.py は出力モデル設定のあるTaskから実行する"',
            ),
        ],
        "sweep_trial.py": [
            (
                '"""A Sweep trial: runs sweep_training.py as is, '
                'pausing every epoch so hyperband can compare trials."""',
                '"""Sweepの試行: sweep_training.py をそのまま使い、'
                'hyperbandが途中で比べられるようepochごとに待つ。"""',
            ),
            (
                "# The API decides hyperband every 15 seconds; "
                "the pause lets it compare trials at the same epoch.",
                "# APIのhyperband判定は15秒ごとなので、"
                "epochの間を空けて同じepochの試行を比べられるようにする。",
            ),
        ],
    },
)

ENGLISH = SampleText(
    project_name="Voice model experiments (sample)",
    project_description=(
        "Sample of training a speech synthesis model → automatic registration → inference → evaluation → "
        "promotion, with Sweeps and reports"
    ),
    local_account_name="Voice team (sample local account)",
    worker_account_description="CPU worker for the sample",
    automation_account_description="Runs automatic inference, evaluation and promotion",
    computer_name="Sample CPU (local)",
    experiments={
        "training": (
            "Speech synthesis training",
            "Training Task and automatic inference and evaluation Runs",
        ),
        "sweep": ("Sweep: learning rate and batch size", "Grid search with hyperband early termination"),
        "data": ("Data preparation", "Preparing the audio data"),
    },
    code_description="Sample data",
    # Differ from the experiment names: the Tasks page lists both side by side.
    code_names={
        "training": "TTS training",
        "inference": "TTS inference",
        "evaluation": "Audio length evaluation",
        "sweep": "Sweep trial",
    },
    reference_dataset=("Reference lengths for evaluation", "Expected lengths of the inferred WAV files"),
    inference_output_dataset=("Inference output audio", "WAV files written by automatic inference"),
    model_description="Sample speech synthesis model (a linear model on CPU)",
    inference_rule_name="Infer on registration",
    evaluation_rule_name="Evaluate after inference",
    promotion_policy_name="Promotion criteria for production",
    output_model_note="sample",
    training_run_name="Training run {round_number} ({steps} steps, lr {learning_rate})",
    audio_dataset_name="Synthetic vowel corpus (sample)",
    audio_dataset_description="Synthetic vowels, 16 kHz mono. manifest.jsonl holds the text and the speaker",
    audio_version_notes=("3 vowels", "Adds e and o for 5 vowels"),
    data_run_name="Generate synthetic vowels",
    second_run_note=(
        "## Second training run\n\n"
        "- Trained **longer and with a larger learning rate** than the first run (20 steps, lr 0.05)\n"
        "- `val.loss` converges to almost 0 around step 30\n"
        "- The audio `samples/tone` approaches 440 Hz as the steps advance (compare them with the slider)\n\n"
        "| Run | steps | lr |\n|---|---|---|\n| 1 | 20 | 0.05 |\n| 2 | 60 | 0.1 |\n"
    ),
    first_run_note=(
        "## First training run\n\nA short training run. It was promoted to `production` as the baseline."
    ),
    researcher_comment="val.loss drops nicely. I'd like the second run as the production candidate",
    admin_reply="The evaluation passed as well, and production switched automatically",
    version_comment="Smaller mean error than the baseline (version 1)",
    deleted_comment="(draft)",
    saved_view_name="Training runs compared (loss, accuracy)",
    live_chart_title="train.loss (live)",
    snapshot_chart_title="val.accuracy (snapshot)",
    report_title="Speech synthesis model: two versions compared (sample)",
    report_intro=(
        "# Speech synthesis model: two versions compared\n\n"
        "The training Task ran twice, and each version went through registration → inference → evaluation → "
        "promotion decision automatically.\n\n"
        "- Version 1: 20 steps, lr 0.05 (the first one, promoted to production without a baseline)\n"
        "- Version 2: 60 steps, lr 0.1 (passed against the baseline, version 1, and replaced production)"
    ),
    report_sweep_heading=(
        "## Sweep: learning rate and batch size\n\nA 3×2 grid, with hyperband stopping trials early."
    ),
    report_comment="Snapshot charts are drawn from the data at the time of saving",
    notification_channel_name="Team webhook",
    source_replacements={
        "media_logging.py": [
            (
                'EVALUATION_PROMPTS = ["こんにちは", "ありがとう", "さようなら"]',
                'EVALUATION_PROMPTS = ["hello", "thank you", "goodbye"]',
            )
        ],
    },
)

SAMPLE_TEXTS = {"ja": JAPANESE, "en": ENGLISH}
