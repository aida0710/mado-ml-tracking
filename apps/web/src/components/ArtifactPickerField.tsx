import { useEffect, useEffectEvent, useId, type KeyboardEvent } from 'react';
import type { Artifact } from '@mmt/contracts';
import { Upload } from 'lucide-react';
import { useArtifactChoices } from '../hooks/useArtifactChoices';
import { formatBytes, formatDate } from '../lib/format';
import { isEnterOutsideComposition } from '../lib/imeComposition';
import { ErrorNotice } from './Feedback';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

function ArtifactSummary({ artifact }: { artifact: Artifact }) {
  useLocale();
  return (
    <span className="artifact-choice">
      <span className="mono break-word">{artifact.path}</span>
      <small className="muted">
        {formatBytes(artifact.size)} · {formatDate(artifact.createdAt)}
        {artifact.runId ? '' : ` · ${text.artifactNoRun}`}
      </small>
    </span>
  );
}

/**
 * Artifactを1つ選ぶ。保存したパスでProjectのArtifact（`runId`を渡したときはそのRunのものだけ）の
 * 一覧から検索する、idか`artifact://<id>`を貼り付ける（見つかった時点で選ぶ）、ファイルを
 * アップロードする、のいずれかで選ぶ。選んだArtifactは、UserPickerと同じく、検索欄の代わりに
 * ［選び直す］とともに表示する。`input`は検索欄の文字で、フォームが持ち、検索が途中のままかを
 * 見分けるのに使う。
 *
 * この欄はフォームの中にあるので、アップロードは頼むだけにする（`onRequestUpload`）。
 * ArtifactUploadDialogはフォームのダイアログが自分の横に描く。ここで描くと、アップロードの
 * ダイアログ自身の送信が外側のフォームにも届き（Reactはイベントをコンポーネントのツリーの上へ
 * 伝える）、外側のフォームまで保存してしまう。
 */
export function ArtifactPickerField({
  label,
  hint,
  projectId,
  runId,
  input,
  onInputChange,
  selected,
  onSelect,
  onRequestUpload,
}: {
  label: string;
  hint: string;
  projectId: string;
  runId?: string;
  input: string;
  onInputChange: (input: string) => void;
  selected: Artifact | null;
  onSelect: (artifact: Artifact | null) => void;
  onRequestUpload: () => void;
}) {
  useLocale();
  const inputId = useId();
  const hintId = useId();
  const resultsId = useId();
  const choices = useArtifactChoices({ projectId, runId, input });
  const referenced = choices.referenceId ? choices.artifacts[0] : undefined;
  // 貼り付けたidは1つのArtifactを指すので、もう一度クリックさせずに選ぶ。Artifactごとに1回だけ。
  const selectReferenced = useEffectEvent(() => {
    if (referenced && !selected) onSelect(referenced);
  });
  const referencedId = referenced?.id;
  useEffect(() => {
    if (referencedId) selectReferenced();
  }, [referencedId]);
  const chooseAgain = () => {
    // 入力も空にする。残すと、貼り付けたidですぐ同じArtifactがまた選ばれる。
    onInputChange('');
    onSelect(null);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isEnterOutsideComposition(event)) return;
    // ダイアログのフォームの中では、EnterでArtifactを選ぶ前に送信してしまう。
    event.preventDefault();
    const onlyMatch = choices.artifacts.length === 1 ? choices.artifacts[0] : undefined;
    if (onlyMatch) onSelect(onlyMatch);
  };
  if (selected)
    return (
      <div className="field">
        <span>{label}</span>
        <div className="picker-selected">
          <ArtifactSummary artifact={selected} />
          <button type="button" className="button small" autoFocus onClick={chooseAgain}>
            {text.artifactPickerChooseAgain}
          </button>
        </div>
        {runId && selected.runId !== runId && (
          <p className="field-hint">{text.artifactPickerOtherRun}</p>
        )}
      </div>
    );
  const emptyMessage = choices.hasSearch
    ? text.artifactPickerEmptySearch
    : runId
      ? text.artifactPickerEmptyRun
      : text.artifactPickerEmpty;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="search"
        value={input}
        autoComplete="off"
        spellCheck={false}
        placeholder={text.artifactPickerPlaceholder}
        aria-describedby={hintId}
        aria-controls={resultsId}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <p id={hintId} className="field-hint">
        {hint}
      </p>
      <div id={resultsId} aria-live="polite">
        <ErrorNotice message={choices.error} retry={choices.reload} />
        {choices.loading ? (
          <p className="muted">{text.loading}</p>
        ) : choices.referenceMissing ? (
          <p className="muted">{text.artifactPickerNotFound}</p>
        ) : !choices.error && !choices.artifacts.length ? (
          <p className="muted">{emptyMessage}</p>
        ) : (
          choices.artifacts.length > 0 && (
            <ul className="picker-results">
              {choices.artifacts.map((artifact) => (
                <li key={artifact.id}>
                  <button type="button" onClick={() => onSelect(artifact)}>
                    <ArtifactSummary artifact={artifact} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
      <div>
        <button type="button" className="button small" onClick={onRequestUpload}>
          <Upload size={14} />
          {text.uploadArtifact}
        </button>
      </div>
    </div>
  );
}
