import { useEffect, type RefObject } from 'react';
import { composeDocumentTitle, getProductName } from '../lib/documentTitle';

/**
 * 渡した要素の文字列（画面の見出し、次にその上の行）でブラウザのタブに名前を付ける。要素で
 * 組み立てた見出し（リンクに囲まれたRun名など）でも、見たとおりの文でタブに名前が付く。画面を
 * 離れると、次の画面が名前を付けるまで製品名に戻す。
 */
export function usePageDocumentTitle(parts: readonly RefObject<HTMLElement | null>[]) {
  // レンダリングのたびに動く。見出しの文字列はページのpropsから作られ、propsと一緒に変わる。
  useEffect(() => {
    document.title = composeDocumentTitle(parts.map((part) => part.current?.textContent));
  });
  useEffect(
    () => () => {
      document.title = getProductName();
    },
    [],
  );
}
