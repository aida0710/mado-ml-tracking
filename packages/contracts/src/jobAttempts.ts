/**
 * Jobの再試行の連鎖での試行番号の最大値。maxAttempts（自動の再試行）はこれより多くを求められ
 * ない。人はmaxAttemptsを超えてJobを再試行できるが、この値は超えられない。再試行の連鎖を
 * さかのぼって元の自動実行を探すAPIの検索も、ここで止まる。
 */
export const MAX_JOB_ATTEMPTS = 100;

/** リクエストがmaxAttemptsを省いたときの値。指定できるようになる前のworkerの再試行の方針と同じ。 */
export const DEFAULT_JOB_ATTEMPTS = 3;
