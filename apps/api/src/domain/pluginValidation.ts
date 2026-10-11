import { z } from 'zod';
import { madoPluginConfigSchema } from '@mmt/contracts/schemas';

const serviceUrlSchema = z
  .url()
  .max(2000)
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
const namespaceSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => value !== '*', 'Enumerate namespaces');
export const madoConfigInputSchema = madoPluginConfigSchema.extend({
  apiUrl: serviceUrlSchema,
  webUrl: serviceUrlSchema,
  lineageUrl: serviceUrlSchema,
  namespaces: z
    .array(namespaceSchema)
    .min(1)
    .max(50)
    .refine((values) => new Set(values).size === values.length),
  jobNamespace: z.string().trim().min(1).max(512),
  storageSystemKey: z.string().trim().min(1).max(512),
});
const credentialSchema = z
  .string()
  .min(1)
  .max(8192)
  .refine((value) => !/[\r\n]/.test(value));
export const madoCredentialsInputSchema = z.strictObject({
  readToken: credentialSchema.optional(),
  lineageToken: credentialSchema.optional(),
  metricsToken: credentialSchema.nullable().optional(),
});
export const pluginCreateSchema = z.strictObject({
  kind: z.literal('mado'),
  name: z.string().trim().min(1).max(200).default('Mado'),
  config: madoConfigInputSchema,
  credentials: madoCredentialsInputSchema.optional(),
  enabled: z.boolean().default(false),
});
export const pluginPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    config: madoConfigInputSchema.optional(),
    credentials: madoCredentialsInputSchema.optional(),
    enabled: z.boolean().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .refine(
    (input) => (!input.config && !input.credentials) || input.expectedRevision !== undefined,
    'expectedRevision is required when changing configuration',
  );
