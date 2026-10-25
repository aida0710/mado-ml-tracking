import { isDeepStrictEqual } from 'node:util';
import type { ComputeTarget } from '@mmt/contracts';
import { DomainError } from './errors.js';

// mado ML Trackingがsiteについて名前のほかに保存するもの。アドレス・アカウント・鍵・
// GPU IDは持たない。
function hasSiteOnlyDescription(target: Omit<ComputeTarget, 'id' | 'ownerUserId'>): boolean {
  const connection = [
    target.host,
    target.username,
    target.sshKeyPath,
    target.knownHostsPath,
    target.workDirectory,
    target.pythonExecutable,
  ];
  return (
    connection.every((value) => value === '') &&
    target.gpuIds.length === 0 &&
    !target.runtimeKinds.includes('python') &&
    target.datasetTransfer === 'direct'
  );
}

export function validateTargetConfiguration(
  target: Omit<ComputeTarget, 'id' | 'ownerUserId'>,
  allowLocalExecutor: boolean,
): void {
  if (target.executor === 'site') {
    if (!hasSiteOnlyDescription(target))
      throw new DomainError({
        status: 422,
        code: 'site_target_settings',
        message: 'a site cannot have connection settings, GPU IDs or a python runtime (its runtime is a container and datasetTransfer is direct)',
      });
    return;
  }
  if (target.submissionMode !== 'automatic' || target.supportsArray || target.queueTimeoutSeconds !== null)
    throw new DomainError({
      status: 422,
      code: 'site_only_setting',
      message: 'manual submission, arrays and the queue time limit are settings of sites only',
    });
  if (target.executor === 'local' && !allowLocalExecutor)
    throw new DomainError({
      status: 422,
      code: 'local_executor_disabled',
      message: 'the local executor requires explicit permission in development mode',
    });
  // localのコンピュータはworker自身のホストで動くので、自分のアドレスやアカウントを持たない。
  if (target.executor === 'ssh' && (!target.host || !target.username))
    throw new DomainError({
      status: 422,
      code: 'target_connection_required',
      message: 'SSH host and username are required',
    });
  if (target.executor === 'ssh' && (!target.sshKeyPath || !target.knownHostsPath))
    throw new DomainError({
      status: 422,
      code: 'ssh_config_required',
      message: 'an SSH computer requires paths to the key and known_hosts',
    });
  // コンピュータは接続設定とともに無効の状態で追加し、検査してから設定する（作業ディレクトリと
  // Pythonは検査の結果から決める）。それらが要るのは、Jobを受ける有効なコンピュータだけ。
  if (target.enabled && (!target.workDirectory || !target.pythonExecutable))
    throw new DomainError({
      status: 422,
      code: 'target_setup_incomplete',
      message: 'a working directory and a Python executable path are required to enable it',
    });
}

// これらのフィールドは、キューにある起動と、既存のリモートプロセスへの再接続に影響する。
// データセットの設定は、claimしたJobの入力をどこから取るかと、どのキャッシュの項目を
// 消してよいかを決める。siteのsubmission mode・array・CPUは、キューにあるJobをどう投入し、
// どう組み立てるかを決める。
const executionFields = [
  'host',
  'port',
  'username',
  'sshKeyPath',
  'knownHostsPath',
  'workDirectory',
  'pythonExecutable',
  'runtimeKinds',
  'gpuIds',
  'executor',
  'datasetCacheMaxBytes',
  'datasetTransfer',
  'submissionMode',
  'supportsArray',
  'cpuArch',
] as const;

export function hasTargetExecutionChanges(previous: ComputeTarget, next: ComputeTarget): boolean {
  return executionFields.some((field) => !isDeepStrictEqual(previous[field], next[field]));
}
