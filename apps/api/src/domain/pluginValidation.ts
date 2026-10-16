import { z } from 'zod';
import { madoPluginConfigSchema } from '@mmt/contracts/schemas';

// Match Mado's identity limits and bound work for operator-supplied endpoints and credentials.
const MAX_SERVICE_URL_LENGTH = 2000;
const MAX_IDENTITY_LENGTH = 512;
const MAX_CREDENTIAL_LENGTH = 8192;
const MAX_CONNECTION_NAME_LENGTH = 200;

const serviceUrlSchema = z
  .url()
  .max(MAX_SERVICE_URL_LENGTH)
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'An HTTP URL without credentials, query or fragment is required')
  .transform((value) => value.replace(/\/$/, ''));
// Runs are recorded in one concrete namespace; Mado's "*" only appears in a token's grant.
const jobNamespaceSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_IDENTITY_LENGTH)
  .refine((value) => value !== '*', 'Name one namespace');
export const madoConfigInputSchema = madoPluginConfigSchema.extend({
  apiUrl: serviceUrlSchema,
  webUrl: serviceUrlSchema,
  lineageUrl: serviceUrlSchema,
  jobNamespace: jobNamespaceSchema,
  storageSystemKey: z.string().trim().min(1).max(MAX_IDENTITY_LENGTH),
});
const credentialSchema = z
  .string()
  .min(1)
  .max(MAX_CREDENTIAL_LENGTH)
  .refine((value) => !/[\r\n]/.test(value));
export const madoCredentialsInputSchema = z.strictObject({
  accessToken: credentialSchema.optional(),
});
export const pluginCreateSchema = z.strictObject({
  kind: z.literal('mado'),
  name: z.string().trim().min(1).max(MAX_CONNECTION_NAME_LENGTH).default('Mado'),
  config: madoConfigInputSchema,
  credentials: madoCredentialsInputSchema.optional(),
  enabled: z.boolean().default(false),
});
export const pluginPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(MAX_CONNECTION_NAME_LENGTH).optional(),
    config: madoConfigInputSchema.optional(),
    credentials: madoCredentialsInputSchema.optional(),
    enabled: z.boolean().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .refine(
    (input) => (!input.config && !input.credentials) || input.expectedRevision !== undefined,
    'expectedRevision is required when changing configuration',
  );
