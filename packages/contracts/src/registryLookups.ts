import type { Code, CodeVersion } from './index.js';

/**
 * GET /projects/:p/model-families: Projectで既に使われているモデル系列。Modelの系列として、または
 * コードバージョンの対応モデル系列として使われているもの。画面はこれを候補に出し、同じ系列が
 * 2通りの綴り（`Qwen3`と`qwen3`）で入力されてコードがモデルに対応しなくなるのを防ぐ。
 */
export interface ModelFamilySummary {
  name: string;
  modelCount: number;
  codeVersionCount: number;
}

/** GET /projects/:p/code-versions/:id: コードバージョンとそのコード。名前で表示するのに使う。 */
export interface CodeVersionDetail {
  code: Code;
  version: CodeVersion;
}

/**
 * GET /projects/:p/automation-rules/:id/metric-keysのキーの出どころ。rule_runs: ルールの自動実行が
 * 作ったRun（そのJobを手動で再試行したものを含む）。code_version_runs: ルールがまだメトリクスのある
 * Runを作っていないので、ルールのコードバージョンを使った同じ種類のRun。none: どちらもメトリクスを
 * 記録していない。
 */
export type RuleMetricKeySource = 'rule_runs' | 'code_version_runs' | 'none';

/** 最新のRunが記録したメトリクスのキー（並べ替え済み）。昇格の基準を書くときの候補に出す。 */
export interface RuleMetricKeys {
  items: string[];
  source: RuleMetricKeySource;
}
