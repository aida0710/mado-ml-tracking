import { useState } from 'react';
import { CodeFileTree } from './CodeFileTree';
import { CodeView } from './preview/CodeView';
import { useLocale } from '../i18n/useLocale';
import { codeSourceText } from '../i18n/codeSource';

/**
 * The files of a saved code version, read-only: the file list beside the file colored by its
 * format, as Artifact previews show text. Anyone who can see the version can read it, viewers
 * included. Monaco (the version form's editor) is not loaded here, so the Code page stays light.
 */
export function CodeFilesViewer({ files }: { files: Readonly<Record<string, string>> }) {
  useLocale();
  const paths = Object.keys(files).sort();
  const [chosenPath, setChosenPath] = useState('');
  // A file chosen in another version may not exist here; the first file is shown instead.
  const activePath = Object.hasOwn(files, chosenPath) ? chosenPath : (paths[0] ?? '');
  if (!paths.length) return <p className="muted">{codeSourceText.noFiles}</p>;
  return (
    <div className="workspace-editor-grid code-files-viewer" data-testid="code-files-viewer">
      <CodeFileTree paths={paths} activePath={activePath} onSelect={setChosenPath} />
      <div className="workspace-editor-pane">
        <div className="editor-file-header mono">{activePath}</div>
        {/* A new key per file: the format select starts from that file's own format. */}
        <CodeView key={activePath} content={files[activePath] ?? ''} fileName={activePath} />
      </div>
    </div>
  );
}
