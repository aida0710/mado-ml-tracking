import { toRunSearchConditions } from './runFilter';

// `loss < 0.2`や`batch_size = 16`のように、前にmetrics.やparams.を付けずに書いた比較。
// キーには、メトリクスの名前によくあるように点を含んでもよい（train.loss）。
const UNPREFIXED_COMPARISON =
  /^\s*([\p{L}_][\p{L}\p{N}_./-]*)\s*(<=|>=|!=|<|>|=)\s*(.+?)\s*$/u;
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const QUOTED = /^(['"])(.*)\1$/s;

/**
 * グループの無い比較をRunの名前として検索したときに、利用者がおそらく意図した絞り込み。数なら
 * メトリクスと比べ、ほかの値ならパラメータと等しいかを見る。それ以外はnull。
 */
export function suggestRunFilter(searchText: string): string | null {
  if (!('name' in toRunSearchConditions(searchText))) return null;
  const match = UNPREFIXED_COMPARISON.exec(searchText);
  if (!match) return null;
  const [, key, operator, value] = match as unknown as [string, string, string, string];
  if (NUMBER.test(value)) return `metrics.${key} ${operator} ${value}`;
  if (operator !== '=' && operator !== '!=') return null;
  const text = QUOTED.exec(value)?.[2] ?? value;
  return `params.${key} ${operator} '${text.replaceAll("'", "''")}'`;
}
