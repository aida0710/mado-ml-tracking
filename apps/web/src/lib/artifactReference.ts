import { isUuid } from './uuid';

// The URI the upload panel shows for a finished Artifact (UploadQueuePanel).
export const ARTIFACT_URI_SCHEME = 'artifact://';
// The label a Run's Artifacts tab puts before the id ("Artifact ID: <id>"), copied along with it.
const ARTIFACT_ID_LABEL_PATTERN = /^artifact\s*id\s*[:：]\s*/i;
// The id inside a link to an Artifact, such as its content URL (/api/projects/<p>/artifacts/<id>/content).
const ARTIFACT_LINK_PATTERN = /\/artifacts\/([0-9a-f-]{36})(?=[/?#]|$)/i;

/**
 * The Artifact id in a pasted value: the id itself (the upload panel's copy button), the
 * `artifact://<id>` URI the panel shows, the id copied with its "Artifact ID:" label, or a link to
 * the Artifact. Anything else is null, and the field treats it as a search by saved path.
 */
export function parseArtifactReference(input: string): string | null {
  const value = input.trim().replace(ARTIFACT_ID_LABEL_PATTERN, '');
  const withoutScheme = value.toLowerCase().startsWith(ARTIFACT_URI_SCHEME)
    ? value.slice(ARTIFACT_URI_SCHEME.length)
    : value;
  if (isUuid(withoutScheme)) return withoutScheme.toLowerCase();
  const linked = value.match(ARTIFACT_LINK_PATTERN)?.[1];
  return linked && isUuid(linked) ? linked.toLowerCase() : null;
}
