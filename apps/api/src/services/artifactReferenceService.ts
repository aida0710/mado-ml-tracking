import type { ArtifactReferences } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { listArtifactReferences } from '../repositories/artifactReferenceRepository.js';
import { requireProject } from './accessService.js';

/** Artifactが使われている場所。ファイルを持つものと、残っている理由を表示する画面のため。 */
export class ArtifactReferenceService {
  constructor(private readonly database: Database) {}

  /** 存在しない、削除済み、別のProjectのIDは、拒まずに結果から外す。 */
  async list(
    principal: Principal,
    location: { projectId: string; artifactIds: string[] },
  ): Promise<ArtifactReferences[]> {
    await requireProject(this.database, principal, {
      projectId: location.projectId,
      role: 'viewer',
      scope: 'read',
    });
    if (!location.artifactIds.length) return [];
    return listArtifactReferences(this.database, location);
  }
}
