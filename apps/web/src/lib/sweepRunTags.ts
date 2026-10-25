// Sweepのコントローラが試行のRunに付けるタグ（apps/apiのservices/sweepController.ts）。

/** 試行のRunが属するSweep。 */
export const SWEEP_ID_TAG = 'mmt.sweepId';
/**
 * Sweepが早期終了した試行に付ける。MLflowには早期終了の状態が無いのでRun自体はcanceledで
 * 終わり、このタグで2つを見分ける。
 */
export const SWEEP_EARLY_STOPPED_TAG = 'mmt.sweepEarlyStopped';
