import * as english from './en/runtime';
import { localized } from './localized';
import type { ExecutionRuntimeKind } from '@mmt/contracts';

export const runtimeLabels: Record<ExecutionRuntimeKind, string> = localized({
  python: 'Python',
  docker: 'Docker',
  singularity: 'Singularity',
  apptainer: 'Apptainer',
}, english.runtimeLabels);
