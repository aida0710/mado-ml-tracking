import { useRef } from 'react';
import { artifactBrowserPanes } from '../lib/artifactBrowserPanes';
import { narrowerThan } from '@mado/design-system/layout';
import { useMediaQuery } from '@mado/design-system/react';

/**
 * 今の幅でArtifactのブラウザが出すペインと、その外側の要素のref。狭い画面では、一覧とプレビューを
 * 切り替えると片方がもう片方に置き換わるので、切り替えた後に`scrollBrowserIntoView`でブラウザの
 * 先頭を画面に戻す。
 */
export function useArtifactBrowserPanes(hasChosenFile: boolean) {
  const isNarrow = useMediaQuery(narrowerThan('md'));
  const containerRef = useRef<HTMLDivElement>(null);
  const panes = artifactBrowserPanes({ isNarrow, hasChosenFile });
  const scrollBrowserIntoView = () => {
    if (isNarrow) containerRef.current?.scrollIntoView({ block: 'nearest' });
  };
  return { isNarrow, panes, containerRef, scrollBrowserIntoView };
}
