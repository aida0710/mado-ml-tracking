import { toRunSearchConditions } from './runFilter';

// `loss < 0.2` or `batch_size = 16`: a comparison written without metrics. or params. in front.
// The key may hold dots (train.loss), as metric names often do.
const UNPREFIXED_COMPARISON =
  /^\s*([\p{L}_][\p{L}\p{N}_./-]*)\s*(<=|>=|!=|<|>|=)\s*(.+?)\s*$/u;
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const QUOTED = /^(['"])(.*)\1$/s;

/**
 * The filter someone most likely meant when a comparison without a group was searched as a Run
 * name: a number compares a metric, any other value equals a param. Null for anything else.
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
