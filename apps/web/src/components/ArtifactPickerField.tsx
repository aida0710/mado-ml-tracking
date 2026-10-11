import { useEffect, useId, type KeyboardEvent } from 'react';
import type { Artifact } from '@mmt/contracts';
import { Upload } from 'lucide-react';
import { useArtifactChoices } from '../hooks/useArtifactChoices';
import { formatBytes, formatDate } from '../lib/format';
import { isComposingKey } from '../lib/imeComposition';
import { ErrorNotice } from './Feedback';
import { text } from '../i18n/catalog';

function ArtifactSummary({ artifact }: { artifact: Artifact }) {
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
 * Picks one Artifact: from a list of the Project's Artifacts (only `runId`'s when given) searched
 * by saved path, by pasting its id or `artifact://<id>` (taken as soon as it is found), or by
 * uploading a file. The picked Artifact replaces the search with［選び直す］, as UserPicker does.
 * `input` is the search field's text, kept by the form so it can tell an unfinished search apart.
 *
 * The field sits inside its form, so it only asks for the upload (`onRequestUpload`): the form's
 * dialog renders ArtifactUploadDialog beside itself. Rendered here, the upload dialog's own submit
 * would also reach the outer form (React passes events up the component tree) and save it.
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
  const inputId = useId();
  const hintId = useId();
  const resultsId = useId();
  const choices = useArtifactChoices({ projectId, runId, input });
  const referenced = choices.referenceId ? choices.artifacts[0] : undefined;
  useEffect(() => {
    // A pasted id names one Artifact, so it is taken without another click.
    if (referenced && !selected) onSelect(referenced);
  }, [referenced?.id]);
  const chooseAgain = () => {
    // Emptied too, or a pasted id would pick the same Artifact again at once.
    onInputChange('');
    onSelect(null);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isComposingKey(event)) return;
    // Inside a dialog form, Enter would submit before an Artifact is picked.
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
