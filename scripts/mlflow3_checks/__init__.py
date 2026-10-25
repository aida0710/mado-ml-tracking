"""mado ML Trackingを相手に公式のMLflow 3 SDKを動かす検査。モジュールごとに1つの領域を扱う。

scripts/verify_mlflow3.pyがtracking URIとtokenを設定し、各モジュールの``verify_*``関数を
呼んで、返ってきた要約を保存する。
"""
