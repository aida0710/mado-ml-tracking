import type { ComputeTarget } from '@mmt/contracts';
import type { CreateTarget, UpdateTarget } from '../api/inputs';
import type { FormValues } from '../types/form';
import { getFieldValue } from './formValues';
import { buildTargetInput, type TargetInput } from './targetInput';

/** sshやlocalのコンピュータの手順1「接続」。呼び名と、workerがどうつなぐか。 */
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

/** 手順2「接続後の設定」。workerがつないだ後に、そのJobが使うもの。 */
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
 * 手順1の最後のPOST /targets。コンピュータは無効のまま保存し、設定を保存するまでJobを受けない
 * ようにする（APIが作業ディレクトリとPythonを求めるのは、有効にするときだけ）。
 */
export function buildNewComputerCreate(values: FormValues): CreateTarget {
  return { ...buildTargetInput(values), enabled: false };
}

/** コンピュータが既にあるときの手順1のPATCH（手順1をやり直したときや、編集後の再確認）。 */
export function buildConnectionPatch(values: FormValues, target: ComputeTarget): UpdateTarget {
  return pickFields(buildTargetInput(values, target), CONNECTION_FIELDS);
}

/** 手順2のPATCH。「有効」にチェックがあれば、コンピュータを有効にもする。 */
export function buildSetupPatch(values: FormValues, target: ComputeTarget): UpdateTarget {
  return pickFields(buildTargetInput(values, target), SETUP_FIELDS);
}

/**
 * 入力した接続が保存済みのものと違うので、確認の前に保存しなければならない。入力のままの文字で
 * 比べるので、入力途中のフォーム（編集中に表示される）でもここで解析に失敗しない。
 */
export function hasConnectionChanges(values: FormValues, target: ComputeTarget): boolean {
  return CONNECTION_FIELDS.some((field) => getFieldValue(values, field) !== String(target[field]));
}
