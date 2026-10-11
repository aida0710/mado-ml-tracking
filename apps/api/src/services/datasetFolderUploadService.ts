import type { DatasetFolderUpload } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { assertProjectReference } from '../repositories/registryRepository.js';
import { listUnfinishedFolderUploads } from '../repositories/datasetFolderUploadRepository.js';
import { requireProject } from './accessService.js';

/**
 * Folder uploads of a dataset that stopped before their version, so the Web can continue one or
 * discard it (ArtifactDeletionService.deleteDatasetFolderUpload) instead of leaving its files.
 */
export class DatasetFolderUploadService {
  constructor(private readonly database: Database) {}

  async list(
    principal: Principal,
    location: { projectId: string; datasetId: string },
  ): Promise<DatasetFolderUpload[]> {
    await requireProject(this.database, principal, {
      projectId: location.projectId,
      role: 'viewer',
      scope: 'read',
    });
    const datasetId = await assertProjectReference(this.database, {
      table: 'datasets',
      projectId: location.projectId,
      id: location.datasetId,
    });
    return listUnfinishedFolderUploads(this.database, { projectId: location.projectId, datasetId });
  }
}
