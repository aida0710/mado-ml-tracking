import { useEffect, useEffectEvent, useState } from 'react';
import type { FieldSuggestions, SuggestFieldValues } from '../types/form';

// 入力が止まるのを待ち、キーを押すたびに問い合わせを始めないようにする。
export const FIELD_SUGGESTION_DELAY_MS = 200;

const NO_SUGGESTIONS: FieldSuggestions = { items: [] };

/**
 * `value`に対して`suggest`が出す候補。入力が止まってから問い合わせる。新しい値は、古い値の実行中の
 * 問い合わせを中止するので、遅れて届いた答えが新しい答えを置き換えることはない。新しい答えが
 * 届くまでは前の候補を、注記を外して出したままにする。
 *
 * 空の値は`offerWhenEmpty`のとき（何か入力する前に出す価値のある短い一覧）だけ問い合わせる。
 * `refreshKey`が変わると同じ値をもう一度問い合わせ、後から届く候補（workerが読んだばかりの
 * ディレクトリ）を拾う。
 */
export function useFieldSuggestions(
  value: string,
  suggest: SuggestFieldValues | undefined,
  {
    offerWhenEmpty = false,
    refreshKey = 0,
  }: { offerWhenEmpty?: boolean; refreshKey?: string | number } = {},
): FieldSuggestions {
  // 欄の定義はレンダリングのたびに作り直される。いつ問い合わせるかは値だけで決める。
  const lookUp = useEffectEvent((typed: string, signal: AbortSignal) => suggest!(typed, signal));
  const hasSuggest = suggest !== undefined;
  const isLookingUp = hasSuggest && (value !== '' || offerWhenEmpty);
  const [answer, setAnswer] = useState<{ value: string; suggestions: FieldSuggestions } | null>(
    null,
  );
  // 何も問い合わせていない間は忘れ、次の値で古い候補が戻ってこないようにする。
  if (!isLookingUp && answer !== null) setAnswer(null);
  useEffect(() => {
    if (!isLookingUp) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      lookUp(value, controller.signal).then(
        (suggestions) => {
          if (!controller.signal.aborted) setAnswer({ value, suggestions });
        },
        () => {
          // 候補は入力の助けにすぎない。問い合わせに失敗しても、候補無しで欄は使える。
          if (!controller.signal.aborted) setAnswer({ value, suggestions: NO_SUGGESTIONS });
        },
      );
    }, FIELD_SUGGESTION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, isLookingUp, refreshKey]);
  if (!answer || !isLookingUp) return NO_SUGGESTIONS;
  return answer.value === value
    ? answer.suggestions
    : { items: answer.suggestions.items, details: answer.suggestions.details };
}
