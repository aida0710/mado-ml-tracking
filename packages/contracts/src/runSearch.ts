import type { Run, RunKind, RunStatus } from './index.js';

/**
 * 全履歴を対象にしたサーバー側のRunの検索。`filter`と`orderBy`はMLflowの検索構文を使う
 * （`metrics.loss < 0.1 AND params.lr = '0.01'`、`metrics.loss ASC`）。`orderBy`が無ければ
 * 作成日時の新しい順に並び、新しいRunが来てもカーソルはずれない。上限（docs/api-contract.md）:
 * filterは2000文字、orderByは5個、limitは1〜500（既定100）。
 */
export interface RunSearchRequest {
  experimentIds?: string[];
  filter?: string;
  orderBy?: string[];
  kinds?: RunKind[];
  statuses?: RunStatus[];
  modelVersionIds?: string[];
  inputDatasetVersionIds?: string[];
  parentRunId?: string;
  /** Runの名前の部分文字列（大文字・小文字を区別しない）。 */
  name?: string;
  limit?: number;
  /** 前のページの`nextCursor`。ほかの条件が変わっていれば拒否する。 */
  cursor?: string;
}
/** 項目はRunのポーリング用の要約で、`executionSnapshot`を含まない。 */
export interface RunSearchPage {
  items: Run[];
  nextCursor: string | null;
}
