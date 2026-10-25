import type { DatasetFolderUpload } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { assertProjectReference } from '../repositories/registryRepository.js';
import { listUnfinishedFolderUploads } from '../repositories/datasetFolderUploadRepository.js';
import { requireProject } from './accessService.js';

/**
 * バージョンを作る前に止まった、データセットのフォルダアップロード。画面はそれを続けるか捨てる
 * （ArtifactDeletionService.deleteDatasetFolderUpload）ことができ、ファイルを放置せずに済む。
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
