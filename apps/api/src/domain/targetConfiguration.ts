import { isDeepStrictEqual } from 'node:util';
import type { ComputeTarget } from '@mmt/contracts';
import { DomainError } from './errors.js';

// What tracking stores for a site beyond its name: no address, account, keys or GPU IDs.
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
  // A local target runs on the worker's own host, so it has no address or account of its own.
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
  // A computer is added disabled with its connection, checked, and then set up (its work directory
  // and Python come from the check); only an enabled one takes Jobs and needs them.
  if (target.enabled && (!target.workDirectory || !target.pythonExecutable))
    throw new DomainError({
      status: 422,
      code: 'target_setup_incomplete',
      message: 'a working directory and a Python executable path are required to enable it',
    });
}

// These fields affect queued launches and reattachment of existing remote processes. The dataset
// settings decide where a claimed Job's inputs come from and which cache entries may be deleted.
// A site's submission mode, arrays and CPU decide how its queued Jobs are submitted and built.
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
