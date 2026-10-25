import { useEffect, useRef } from 'react';

/** 非同期の処理が、接続の画面が置き換わった後の結果を捨てるのに使う。 */
export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}
