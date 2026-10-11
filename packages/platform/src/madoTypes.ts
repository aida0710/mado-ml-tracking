import { z } from 'zod';

const identitySchema = z.string().min(1).max(512);
const uriSchema = z
  .string()
  .min(1)
  .max(4000)
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
  contentHash: z.string().min(1).max(1000).nullable(),
  manifestHash: z.string().min(1).max(1000).nullable(),
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
    .max(1000),
});
export const madoDatasetSchema = z.object({
  datasetId: z.uuid(),
  namespace: identitySchema,
  name: identitySchema,
  versions: z.array(madoVersionSchema).max(1000),
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
    .max(100),
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
