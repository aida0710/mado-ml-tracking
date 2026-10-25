"""自動化したパイプラインの軽いsmoke。自動の昇格までの成功の経路と失敗する学習を確かめ、
2回目の学習、result.jsonの経路、コンテナは含めない。

段階を減らしたscripts/verify_pipeline.pyで、報告は
artifacts/verification/<JST date>/pipeline-smoke/pipeline-smoke.jsonに書く。
"""

from __future__ import annotations

import sys

from verify_pipeline import SMOKE_PROFILE, main

if __name__ == "__main__":
    sys.exit(main(SMOKE_PROFILE))
