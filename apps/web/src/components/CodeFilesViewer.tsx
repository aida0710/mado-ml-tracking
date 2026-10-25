import { useState } from 'react';
import { CodeFileTree } from './CodeFileTree';
import { CodeView } from './preview/CodeView';
import { useLocale } from '../i18n/useLocale';
import { codeSourceText } from '../i18n/codeSource';

/**
 * 保存したコードバージョンのファイルを読み取り専用で表示する。ファイルの一覧の横に、Artifactの
 * プレビューがテキストを表示するのと同じく、形式に合わせて色を付けたファイルを並べる。バージョンを
 * 見られる人ならViewerも含めてだれでも読める。Monaco（バージョンのフォームのエディタ）はここでは
 * 読み込まないので、Codeの画面は軽いままになる。
 */
export function CodeFilesViewer({ files }: { files: Readonly<Record<string, string>> }) {
  useLocale();
  const paths = Object.keys(files).sort();
  const [chosenPath, setChosenPath] = useState('');
  // 別のバージョンで選んだファイルはここに無いことがある。そのときは先頭のファイルを表示する。
  const activePath = Object.hasOwn(files, chosenPath) ? chosenPath : (paths[0] ?? '');
  if (!paths.length) return <p className="muted">{codeSourceText.noFiles}</p>;
  return (
    <div className="workspace-editor-grid code-files-viewer" data-testid="code-files-viewer">
      <CodeFileTree paths={paths} activePath={activePath} onSelect={setChosenPath} />
      <div className="workspace-editor-pane">
        <div className="editor-file-header mono">{activePath}</div>
        {/* ファイルごとにkeyを変え、形式の選択欄をそのファイルの形式から始める。 */}
        <CodeView key={activePath} content={files[activePath] ?? ''} fileName={activePath} />
      </div>
    </div>
  );
}
