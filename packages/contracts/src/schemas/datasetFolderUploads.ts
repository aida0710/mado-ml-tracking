import { z } from 'zod';
import type { DatasetFolderUpload, DatasetFolderUploadDiscard } from '../datasetFolderUploads.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const datasetFolderUploadSchema = namedContractSchema(
  'DatasetFolderUpload',
  z.strictObject({
    folder: z.string(),
    pathPrefix: z.string(),
    fileCount: z.number().int(),
    totalSize: z.number().int(),
    firstStoredAt: z.string(),
    lastStoredAt: z.string(),
  }),
);
export const datasetFolderUploadDiscardSchema = namedContractSchema(
  'DatasetFolderUploadDiscard',
  z.strictObject({ deletedFileCount: z.number().int(), keptFileCount: z.number().int() }),
);

type _DatasetFolderUpload = Expect<
  MutuallyAssignable<z.infer<typeof datasetFolderUploadSchema>, DatasetFolderUpload>
>;
type _DatasetFolderUploadDiscard = Expect<
  MutuallyAssignable<z.infer<typeof datasetFolderUploadDiscardSchema>, DatasetFolderUploadDiscard>
>;
