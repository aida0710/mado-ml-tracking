import type { ArtifactReferences } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { listArtifactReferences } from '../repositories/artifactReferenceRepository.js';
import { requireProject } from './accessService.js';

/** Where Artifacts are used, for the screens that show a file's owners and why it stays. */
export class ArtifactReferenceService {
  constructor(private readonly database: Database) {}

  /** Unknown, deleted, and other Projects' IDs are left out rather than refused. */
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
