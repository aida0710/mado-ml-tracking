import { z } from 'zod';
import {
  ARTIFACT_PREVIEW_KINDS,
  type ArtifactPreview,
  type WaveformPeaksPreview,
} from '../artifactPreviews.js';
import { idSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const artifactPreviewSchema = namedContractSchema(
  'ArtifactPreview',
  z.strictObject({
    artifactId: idSchema,
    kind: z.enum(ARTIFACT_PREVIEW_KINDS),
    status: z.enum(['queued', 'running', 'ready', 'failed', 'skipped']),
    previewArtifactId: idSchema.nullable(),
    error: z.string().nullable(),
    attempts: z.number().int(),
    updatedAt: timestampSchema,
  }),
);
// プレビューのworkerが書くピークは最大8192個。大きく超えるものはworkerが作ったものではない。
const WAVEFORM_PEAKS_LIMIT = 65536;
const waveformPeaksSchema = z.array(z.number().min(-1).max(1)).min(1).max(WAVEFORM_PEAKS_LIMIT);
// ルートの本文ではない。'waveform-peaks'のArtifactの中身で、Webの画面のビューアが取得する。
export const waveformPeaksPreviewSchema = namedContractSchema(
  'WaveformPeaksPreview',
  z
    .strictObject({
      version: z.literal(1),
      sampleRate: z.number().int().positive(),
      durationSeconds: z.number().nonnegative(),
      samplesPerPeak: z.number().int().positive(),
      min: waveformPeaksSchema,
      max: waveformPeaksSchema,
    })
    .refine((preview) => preview.min.length === preview.max.length, {
      message: 'min and max must have the same number of peaks',
    }),
);

type _ArtifactPreview = Expect<
  MutuallyAssignable<z.infer<typeof artifactPreviewSchema>, ArtifactPreview>
>;
type _WaveformPeaksPreview = Expect<
  MutuallyAssignable<z.infer<typeof waveformPeaksPreviewSchema>, WaveformPeaksPreview>
>;
