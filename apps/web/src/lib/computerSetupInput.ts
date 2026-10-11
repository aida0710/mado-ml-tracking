import type { ComputeTarget } from '@mmt/contracts';
import type { CreateTarget, UpdateTarget } from '../api/inputs';
import type { FormValues } from '../types/form';
import { getFieldValue } from './formValues';
import { buildTargetInput, type TargetInput } from './targetInput';

/** Step 1「接続」of an ssh or local computer: what it is called and how a worker reaches it. */
const CONNECTION_FIELDS = [
  'name',
  'executor',
  'visibility',
  'host',
  'port',
  'username',
  'sshKeyPath',
  'knownHostsPath',
] as const satisfies readonly (keyof TargetInput)[];

/** Step 2「接続後の設定」: what its Jobs use once a worker reaches it. */
const SETUP_FIELDS = [
  'workDirectory',
  'pythonExecutable',
  'cpuArch',
  'runtimeKinds',
  'gpuIds',
  'maxConcurrentJobs',
  'datasetTransfer',
  'datasetCacheMaxBytes',
  'enabled',
] as const satisfies readonly (keyof TargetInput)[];

function pickFields<K extends keyof TargetInput>(
  input: TargetInput,
  fields: readonly K[],
): Pick<TargetInput, K> {
  return Object.fromEntries(fields.map((field) => [field, input[field]])) as Pick<TargetInput, K>;
}

/**
 * POST /targets at the end of step 1: the computer is saved disabled, so it takes no Jobs until
 * its setup is saved (the API needs the work directory and Python only to enable it).
 */
export function buildNewComputerCreate(values: FormValues): CreateTarget {
  return { ...buildTargetInput(values), enabled: false };
}

/** PATCH of step 1 when the computer exists (step 1 again, or a re-check after editing it). */
export function buildConnectionPatch(values: FormValues, target: ComputeTarget): UpdateTarget {
  return pickFields(buildTargetInput(values, target), CONNECTION_FIELDS);
}

/** PATCH of step 2, which also enables the computer when 有効 is checked. */
export function buildSetupPatch(values: FormValues, target: ComputeTarget): UpdateTarget {
  return pickFields(buildTargetInput(values, target), SETUP_FIELDS);
}

/**
 * The connection typed differs from the saved one, so a check must save it first. Compared as
 * typed, so a half-typed form (shown while it is edited) never fails to parse here.
 */
export function hasConnectionChanges(values: FormValues, target: ComputeTarget): boolean {
  return CONNECTION_FIELDS.some((field) => getFieldValue(values, field) !== String(target[field]));
}
