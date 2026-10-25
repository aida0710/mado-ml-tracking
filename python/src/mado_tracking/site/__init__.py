"""site。画面で追加したコンピュータのうち、そのJobをjob shellが投入するもの
（ComputeTarget.executor='site'）。

siteの接続、job shell、各人のアカウント設定はmado ML Trackingが持つ。launcherは自分で作った
鍵でログインし、specディレクトリを渡してsiteのjob shellを動かす。ログインにワンタイム
パスワードが要るsiteや、研究者のPCであるsiteでは、代わりに本人がそこで
`mado-tracking submit`を実行する。その後は、計算ノード上のrunnerがJob tokenで自らAPIに
報告する（docs/sites.md）。
"""
