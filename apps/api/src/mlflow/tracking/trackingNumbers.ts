// JavaScriptの数値で正確に表せないint64は、Protobuf JSONでは文字列のまま残す。
export function serializeInt64(value: number | string): number | string {
  const integer = BigInt(value);
  const numeric = Number(integer);
  return Number.isSafeInteger(numeric) ? numeric : integer.toString();
}
