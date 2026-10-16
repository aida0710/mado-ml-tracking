import type { z } from 'zod';
import type { workerInfoSchema } from '../src/domain/validation.js';

export const workerInfo: z.infer<typeof workerInfoSchema> = {
  version: '0.3.0',
  hostname: 'test-worker',
  parallelJobs: 1,
  sshFiles: { keyPaths: [], knownHostsPaths: [] },
  capabilities: [],
};
