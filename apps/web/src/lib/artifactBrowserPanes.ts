/** Artifactのブラウザの2つの部分（ファイルの一覧とプレビュー）のうち、画面に出ている方。 */
export interface ArtifactBrowserPanes {
  showList: boolean;
  showPreview: boolean;
  /** 一覧がプレビューの後ろに隠れているので、プレビューに一覧へ戻る手段を出す。 */
  showBackToList: boolean;
}

/**
 * 広い画面では一覧とプレビューを横に並べる。狭い画面では1つずつ出す。ファイルを選ぶまでは
 * 一覧（パンくずとフォルダの中身）を出し、選んだらそのファイルのプレビューと戻る手段を出す。
 * 狭い画面では何も自動ではプレビューしないので、フォルダを開いても、誰も見たいと言っていない
 * 大きなファイルを取得しない。
 */
export function artifactBrowserPanes({
  isNarrow,
  hasChosenFile,
}: {
  isNarrow: boolean;
  hasChosenFile: boolean;
}): ArtifactBrowserPanes {
  if (!isNarrow) return { showList: true, showPreview: true, showBackToList: false };
  return { showList: !hasChosenFile, showPreview: hasChosenFile, showBackToList: hasChosenFile };
}
