import type { JsonObject } from '@mmt/contracts';
import type { Connection } from '../../db/database.js';
import { DomainError } from '../../domain/errors.js';
import { findSavedArtifact } from '../../repositories/runtimeArtifactRepository.js';
import type { ArtifactService } from '../../services/artifactService.js';
import { readStoredMlmodel } from '../artifacts/mlmodelCapture.js';
import type { ArtifactManifestEntry } from './types.js';

/**
 * The MLmodel of a model directory in Run Artifacts, in the shape a Logged Model keeps it
 * (`{ mlmodel }`), so its flavors choose the model body the same way. Unlike Logged Model
 * uploads, Run uploads are not parsed on the way in (save_model() + log_artifacts() writes an
 * ordinary directory), so the stored file is read when the directory is registered.
 */
export async function readRunModelMetadata(
  connection: Connection,
  source: { projectId: string; manifest: ArtifactManifestEntry[]; artifacts: ArtifactService },
): Promise<JsonObject> {
  const descriptor = source.manifest.find((entry) => entry.path === 'MLmodel');
  if (!descriptor) return {};
  const artifact = await findSavedArtifact(connection, {
    projectId: source.projectId,
    artifactId: descriptor.artifactId,
  });
  let mlmodel: Record<string, unknown> | null;
  try {
    mlmodel = await readStoredMlmodel({
      size: artifact.size,
      open: async () => (await source.artifacts.readContent(artifact)).body,
    });
  } catch (error) {
    // A version must not be fixed to a guessed body because the descriptor could not be read.
    if (error instanceof DomainError) throw error;
    throw new DomainError(503, 'MLmodelを読み込めません', 'artifact_read_failed');
  }
  return mlmodel ? { mlmodel: mlmodel as JsonObject } : {};
}
