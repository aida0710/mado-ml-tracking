import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { ArtifactActionsMenu } from './ArtifactActionsMenu';
import { ArtifactPreview } from './ArtifactPreview';
import { ArtifactReferenceLinks } from './ArtifactReferenceLinks';
import { Resource } from './Feedback';
import { useProject } from '../hooks/useProject';
import { hasArtifactReferences, useArtifactReferences } from '../hooks/useArtifactReferences';
import { useArtifactVersions } from '../hooks/useRunArtifacts';
import { formatBytes, formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * One file: its preview, a download, where it is used, and earlier uploads to the same path.
 * Project admins get the ⋯ menu; a file something uses cannot be deleted, and the menu says so
 * before any confirmation.
 */
export function ArtifactDetailsPanel({
  latest,
  onDeleted,
}: {
  /** The newest upload at the path; an earlier one can be shown from the details. */
  latest: Artifact;
  onDeleted: (artifact: Artifact) => void;
}) {
  useLocale();
  const { isProjectAdmin } = useProject();
  const [shown, setShown] = useState(latest);
  const versions = useArtifactVersions(latest);
  const references = useArtifactReferences(shown.projectId, [shown.id]);
  const shownReferences = references.byArtifactId.get(shown.id);
  const isPrevious = shown.id !== latest.id;
  return (
    <section className="artifact-preview" data-testid="artifact-details">
      <div className="artifact-preview-heading">
        <h3 className="break-word">{shown.path}</h3>
        <div className="artifact-preview-tools">
          <a
            className="icon-button"
            href={trackingApi.artifactUrl(shown.projectId, shown.id)}
            download={shown.path.split('/').pop()}
            aria-label={`${text.download}: ${shown.path}`}
            title={text.download}
          >
            <Download size={17} />
          </a>
          {isProjectAdmin && (
            <ArtifactActionsMenu
              artifact={shown}
              isReferenced={shownReferences ? hasArtifactReferences(shownReferences) : null}
              onDeleted={() => onDeleted(shown)}
            />
          )}
        </div>
      </div>
      <p className="mono muted">
        {shown.mimeType} · {formatBytes(shown.size)} · {formatDate(shown.createdAt)}
      </p>
      {isPrevious && (
        <p className="artifact-version-notice">
          {text.artifactShowingPreviousVersion}{' '}
          <button className="link-button" onClick={() => setShown(latest)}>
            {text.artifactShowLatest}
          </button>
        </p>
      )}
      <ArtifactPreview key={shown.id} artifact={shown} />
      {shownReferences && hasArtifactReferences(shownReferences) && (
        <section className="artifact-references">
          <h4>{text.artifactUsedBy}</h4>
          <ArtifactReferenceLinks projectId={shown.projectId} references={shownReferences} />
        </section>
      )}
      <details>
        <summary>{text.details}</summary>
        <p className="mono break-word">
          {text.artifactId}: {shown.id}
        </p>
        <p className="mono break-word">SHA-256 {shown.sha256}</p>
        <p className="mono">{shown.backend}</p>
        {latest.runId && (
          <>
            <h4>{text.artifactPreviousVersions}</h4>
            <Resource query={versions}>
              {(previous) =>
                previous.length ? (
                  <ul className="artifact-version-list">
                    {previous.map((version) => (
                      <li key={version.id} className={version.id === shown.id ? 'selected' : ''}>
                        <button className="link-button mono" onClick={() => setShown(version)}>
                          {formatDate(version.createdAt)}
                        </button>
                        <span className="mono muted">
                          {formatBytes(version.size)} · {version.sha256.slice(0, 12)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{text.artifactNoPreviousVersions}</p>
                )
              }
            </Resource>
          </>
        )}
      </details>
    </section>
  );
}
