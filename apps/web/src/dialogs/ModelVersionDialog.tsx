import type { Model, ModelVersion } from '@mmt/contracts';
import { useProject } from '../hooks/useProject';
import { useModelVersionForm } from '../hooks/useModelVersionForm';
import { ArtifactPickerField } from '../components/ArtifactPickerField';
import { CheckboxList } from '../components/CheckboxList';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { LabeledField } from '../components/LabeledField';
import { MissingCodeNotice } from '../components/MissingCodeNotice';
import { parseArtifactReference } from '../lib/artifactReference';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import { explainMissingCodeCandidates } from '../lib/codeCandidateReason';
import { toggleValue } from '../lib/formValues';
import { formatDate } from '../lib/format';
import { getDefaultCodeCandidates } from '../lib/taskInput';
import { modelsTextTemplates } from '../i18n/models';
import { text } from '../i18n/catalog';

/**
 * Registers a version of `model` by hand, in the order the work goes: its number (left empty, the
 * API numbers it), the training Run that made it, the weights picked from that Run's Artifacts
 * (or the Project's, or pasted as an id), then parents and the default code of the same family.
 */
export function ModelVersionDialog({
  model,
  onClose,
  onSaved,
}: {
  model: Model;
  onClose: () => void;
  onSaved: (version: ModelVersion) => void;
}) {
  const { project } = useProject();
  const form = useModelVersionForm({ projectId: project.id, model });
  const { draft } = form;
  const catalog = form.catalog.value;
  const catalogOptions = catalog ? buildCatalogOptions(catalog) : null;
  const parentOptions =
    catalog && catalogOptions
      ? catalogOptions.models.filter(
          (option) =>
            catalog.modelVersions.find((version) => version.id === option.value)?.family ===
            model.family,
        )
      : [];
  const defaultCodeIds = new Set(
    getDefaultCodeCandidates(catalog?.codeVersions ?? [], model.family).map((code) => code.id),
  );
  const defaultCodeOptions =
    catalogOptions?.codes.filter((option) => defaultCodeIds.has(option.value)) ?? [];
  const missingCode =
    catalog && !defaultCodeOptions.length
      ? explainMissingCodeCandidates({ codeVersions: catalog.codeVersions, family: model.family })
      : null;
  const pastedWeightsUri = parseArtifactReference(draft.weightsUri);
  const title = `${model.name} · ${text.newVersion}`;
  return (
    <Dialog title={title} onClose={onClose} busy={form.pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().then((version) => {
            if (version) onSaved(version);
          });
        }}
      >
        <fieldset disabled={form.pending}>
          <LabeledField
            label={text.version}
            hint={
              model.nextVersion
                ? modelsTextTemplates.versionAutoNumber(model.nextVersion)
                : text.versionAutoNumberHint
            }
          >
            {(id, hintId) => (
              <input
                id={id}
                className="mono"
                value={draft.version}
                placeholder={model.nextVersion}
                aria-describedby={hintId}
                onChange={(event) => form.change({ version: event.target.value })}
              />
            )}
          </LabeledField>
          <LabeledField label={text.sourceRun} hint={text.sourceRunHint}>
            {(id, hintId) => (
              <select
                id={id}
                value={draft.sourceRunId}
                aria-describedby={hintId}
                disabled={form.sourceRuns.loading}
                onChange={(event) => form.chooseSourceRun(event.target.value)}
              >
                {withEmptyOption(
                  (form.sourceRuns.value ?? []).map((run) => ({
                    value: run.id,
                    label: modelsTextTemplates.sourceRunOption({
                      name: run.name,
                      kind: text[run.kind],
                      date: formatDate(run.createdAt),
                      status: text[run.status],
                    }),
                  })),
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </LabeledField>
          <ErrorNotice message={form.sourceRuns.error} retry={form.sourceRuns.reload} />
          <ArtifactPickerField
            label={text.modelVersionWeightsArtifact}
            hint={
              draft.sourceRunId ? text.weightsArtifactHintRun : text.weightsArtifactHintProject
            }
            projectId={project.id}
            runId={draft.sourceRunId || undefined}
            input={draft.weightsSearch}
            onInputChange={(weightsSearch) => form.change({ weightsSearch })}
            selected={draft.weightsArtifact}
            onSelect={(weightsArtifact) => form.change({ weightsArtifact })}
          />
          <LabeledField label={text.weightsUri} hint={text.weightsUriHint}>
            {(id, hintId) => (
              <input
                id={id}
                className="mono"
                value={draft.weightsUri}
                aria-describedby={hintId}
                onChange={(event) => form.change({ weightsUri: event.target.value })}
              />
            )}
          </LabeledField>
          {pastedWeightsUri && !draft.weightsArtifact && (
            <p className="notice" role="status">
              <span>{text.weightsUriIsArtifact}</span>
              <button
                type="button"
                className="button small"
                onClick={() => form.change({ weightsSearch: draft.weightsUri, weightsUri: '' })}
              >
                {text.weightsUriUseAsArtifact}
              </button>
            </p>
          )}
          <ErrorNotice message={form.catalog.error} retry={form.catalog.reload} />
          {catalog ? (
            <>
              <CheckboxList
                legend={text.parents}
                options={parentOptions}
                selected={draft.parentVersionIds}
                onToggle={(versionId) =>
                  form.change({ parentVersionIds: toggleValue(draft.parentVersionIds, versionId) })
                }
                empty={text.parentsEmpty}
                hint={text.parentsHint}
              />
              <LabeledField label={text.defaultCode} hint={text.defaultCodeHint}>
                {(id, hintId) => (
                  <select
                    id={id}
                    value={draft.defaultCodeVersionId}
                    aria-describedby={hintId}
                    onChange={(event) => form.change({ defaultCodeVersionId: event.target.value })}
                  >
                    {withEmptyOption(defaultCodeOptions).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </LabeledField>
              {missingCode && <MissingCodeNotice reason={missingCode} />}
            </>
          ) : (
            !form.catalog.error && <p className="muted">{text.loading}</p>
          )}
          <LabeledField label={text.metadata}>
            {(id) => (
              <textarea
                id={id}
                rows={4}
                value={draft.metadata}
                onChange={(event) => form.change({ metadata: event.target.value })}
              />
            )}
          </LabeledField>
        </fieldset>
        <ErrorNotice message={form.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={form.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={form.pending}>
            {form.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
