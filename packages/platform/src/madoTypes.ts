import { z } from 'zod';

// Bound untrusted Registry fields and collections independently of the HTTP response byte limit.
const MAX_IDENTITY_LENGTH = 512;
const MAX_URI_LENGTH = 4000;
const MAX_DIGEST_LENGTH = 1000;
const MAX_VERSION_LOCATION_COUNT = 1000;
const MAX_DATASET_VERSION_COUNT = 1000;
// Mado's catalog permits pages of at most 100 datasets.
const MAX_CATALOG_PAGE_SIZE = 100;

const identitySchema = z.string().min(1).max(MAX_IDENTITY_LENGTH);
const uriSchema = z
  .string()
  .min(1)
  .max(MAX_URI_LENGTH)
  .refine((value) => {
    try {
      const uri = new URL(value);
      return (
        ['s3:', 'file:', 'https:', 'http:', 'artifact:', 'mmt:'].includes(uri.protocol) &&
        !uri.username &&
        !uri.password
      );
    } catch {
      return false;
    }
  });
export const madoVersionSchema = z.object({
  id: z.uuid(),
  datasetId: z.uuid(),
  version: identitySchema,
  contentHash: z.string().min(1).max(MAX_DIGEST_LENGTH).nullable(),
  manifestHash: z.string().min(1).max(MAX_DIGEST_LENGTH).nullable(),
  manifestUri: uriSchema.nullable(),
  schemaUri: uriSchema.nullable(),
  locations: z
    .array(
      z.object({
        uri: uriSchema,
        storageKind: z.string(),
        status: z.string(),
        isPrimary: z.boolean(),
      }),
    )
    .max(MAX_VERSION_LOCATION_COUNT),
});
export const madoDatasetSchema = z.object({
  datasetId: z.uuid(),
  namespace: identitySchema,
  name: identitySchema,
  versions: z.array(madoVersionSchema).max(MAX_DATASET_VERSION_COUNT),
});
export const madoCatalogSchema = z.object({
  results: z
    .array(
      z.object({
        datasetId: z.uuid().nullable(),
        namespace: identitySchema,
        name: identitySchema,
        currentVersionId: z.uuid().nullable(),
      }),
    )
    .max(MAX_CATALOG_PAGE_SIZE),
  totalCount: z.number().int().nonnegative(),
});
export const madoVersionDetailSchema = madoVersionSchema.extend({
  namespace: identitySchema,
  name: identitySchema,
});
export type MadoVersion = z.infer<typeof madoVersionSchema>;
export type MadoDataset = z.infer<typeof madoDatasetSchema>;
export type MadoVersionDetail = z.infer<typeof madoVersionDetailSchema>;
export interface MadoCredentials {
  readToken?: string;
  lineageToken?: string;
  metricsToken?: string;
}
