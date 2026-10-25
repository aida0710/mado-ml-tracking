import type { JsonObject } from '@mmt/contracts';
import type { Connection } from '../../db/database.js';
import { DomainError } from '../../domain/errors.js';
import { findSavedArtifact } from '../../repositories/runtimeArtifactRepository.js';
import type { ArtifactService } from '../../services/artifactService.js';
import { readStoredMlmodel } from '../artifacts/mlmodelCapture.js';
import type { ArtifactManifestEntry } from './types.js';

/**
 * RunのArtifactにあるモデルのディレクトリのMLmodelを、Logged Modelが持つ形（`{ mlmodel }`）で
 * 返す。こうしてflavorが同じ方法でモデルの本体を選べる。Logged Modelのアップロードと違い、Runの
 * アップロードは受け取るときに解析しない（save_model() + log_artifacts()は普通のディレクトリを
 * 書く）ので、ディレクトリを登録するときに保存済みのファイルを読む。
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
    // 記述ファイルを読めなかったときに、推測した本体にバージョンを固定してはならない。
    if (error instanceof DomainError) throw error;
    throw new DomainError({
      status: 503,
      code: 'artifact_read_failed',
      message: 'cannot read MLmodel',
    });
  }
  return mlmodel ? { mlmodel: mlmodel as JsonObject } : {};
}
