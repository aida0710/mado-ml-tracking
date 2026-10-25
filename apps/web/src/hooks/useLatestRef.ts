import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * 常に最新のレンダリングの値を持つref。今のpropを呼ぶ必要はあるが、propが変わるたびに
 * 作り直したくないイベントハンドラ・タイマー・コールバックに使う。それらのどれよりも先に動く
 * layout effectで更新する。レンダリング中には読まない。
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
