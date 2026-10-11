/**
 * GET /projects/:p/artifact-references: the records that keep each Artifact, by name, so a screen
 * can say where a file is used and why it cannot be deleted. The kinds are the ones that refuse
 * deletion with 409 artifact_in_use.
 */
export interface ArtifactReferences {
  artifactId: string;
  modelVersions: Array<{ id: string; modelId: string; modelName: string; version: string }>;
  datasetVersions: Array<{
    id: string;
    datasetId: string;
    datasetName: string;
    version: string;
    /** The file's path inside the version. */
    path: string;
  }>;
  codeVersions: Array<{ id: string; codeId: string; codeName: string; version: string }>;
  /** Checkpoints still retained, or that a Run continued from. */
  checkpoints: Array<{ id: string; runId: string; runName: string; step: number }>;
}

/** Maximum artifactIds per request: one page of the Project's Artifact catalog. */
export const ARTIFACT_REFERENCES_BATCH_LIMIT = 100;
