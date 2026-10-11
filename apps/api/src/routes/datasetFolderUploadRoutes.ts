import { Hono } from 'hono';
import { z } from 'zod';
import { DATASET_FOLDER_UPLOAD_FOLDER_PATTERN } from '@mmt/contracts';
import type { ArtifactDeletionService } from '../services/artifactDeletionService.js';
import type { DatasetFolderUploadService } from '../services/datasetFolderUploadService.js';
import { requestMetadata } from '../http/requestMetadata.js';
import { parse, principal, uuidParam, type ApiEnvironment } from '../http/request.js';

// Only folder names a folder upload writes; anything else is not one of its attempts.
export const datasetFolderUploadFolderSchema = z
  .string()
  .regex(new RegExp(DATASET_FOLDER_UPLOAD_FOLDER_PATTERN));

export function datasetFolderUploadRoutes(
  folderUploads: DatasetFolderUploadService,
  deletions: ArtifactDeletionService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/datasets/:id/folder-uploads', async (context) =>
    context.json({
      items: await folderUploads.list(principal(context), {
        projectId: uuidParam(context, 'p'),
        datasetId: uuidParam(context, 'id'),
      }),
    }),
  );
  routes.delete('/:p/datasets/:id/folder-uploads/:folder', async (context) =>
    context.json(
      await deletions.deleteDatasetFolderUpload(
        principal(context),
        {
          projectId: uuidParam(context, 'p'),
          datasetId: uuidParam(context, 'id'),
          folder: parse(datasetFolderUploadFolderSchema, context.req.param('folder')),
        },
        requestMetadata(context),
      ),
    ),
  );
  return routes;
}
