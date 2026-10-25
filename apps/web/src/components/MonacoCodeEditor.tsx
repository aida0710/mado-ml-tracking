import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { defineMonacoTheme, MONACO_THEME_NAMES, monacoFontFamily } from '@mado/design-system/monaco';
import { useDocumentTheme } from '@mado/design-system/react';
import { getFileLanguage } from '../lib/codeWorkspace';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker();
    if (['typescript', 'javascript'].includes(label)) return new TypeScriptWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

export default function MonacoCodeEditor({ path, value, onChange, readOnly = false }: {
  path: string; value: string; onChange: (path: string, content: string) => void; readOnly?: boolean;
}) {
  useLocale();
  const theme = useDocumentTheme();
  const [failure, setFailure] = useState(false);
  const editorId = useId();
  // Undoを各ファイルの中に留め、最後にこのダイアログが持つmodelをすべて解放する。
  const visitedModelPaths = useRef(new Set<string>());
  const modelPath = monaco.Uri.from({ scheme: 'mmt-code', path: `/${editorId}/${path}` }).toString();
  useEffect(() => {
    visitedModelPaths.current.add(modelPath);
  }, [modelPath]);
  useEffect(() => () => {
    for (const visitedPath of visitedModelPaths.current)
      monaco.editor.getModel(monaco.Uri.parse(visitedPath))?.dispose();
  }, []);
  useEffect(() => {
    void loader.init().catch(() => setFailure(true));
  }, []);
  // テーマが変わるたびに、その時点のtokens.cssの値でMonacoの配色を定義し直す。layout effectはEditorの
  // effectより先に動くので、Editorがテーマを切り替える前に定義が済む。
  useLayoutEffect(() => {
    defineMonacoTheme(monaco.editor, theme);
  }, [theme]);
  return failure ? <p className="notice error" role="alert">{text.editorUnavailable}</p> : (
    // modelを切り替えると前のonChangeのリスナーに通知が届くことがあるので、
    // Editorはそれぞれ1つのpathに結び付けておく。
    <Editor key={modelPath} height="100%" path={modelPath} keepCurrentModel saveViewState={false}
      language={getFileLanguage(path)} value={value}
      theme={MONACO_THEME_NAMES[theme]} loading={text.loading}
      onChange={(content) => onChange(path, content ?? '')}
      options={{ readOnly, automaticLayout: true, minimap: { enabled: false },
        fontFamily: monacoFontFamily(), fontSize: 13, scrollBeyondLastLine: false, wordWrap: 'on',
        ariaLabel: `${text.codeEditor}: ${path}` }} />
  );
}
