import { isDeepStrictEqual } from 'node:util';
import type { CodeVersion, ExecutionMode, ExecutionSnapshot, Run } from '@mmt/contracts';
import { DomainError } from './errors.js';

export function createExecutionSnapshot(code: CodeVersion, mode: ExecutionMode): ExecutionSnapshot {
  const entrypoint = mode === 'test' ? (code.testEntrypoint ?? []) : code.entrypoint;
  if (!entrypoint.length)
    throw new DomainError({
      status: 422,
      code: 'test_entrypoint_required',
      message: 'the code version has no test command',
    });
  return {
    codeVersionId: code.id,
    version: code.version,
    mode,
    source: code.source,
    runtime: code.runtime,
    entrypoint,
    requirements: code.requirements,
    environment: code.environment,
  };
}

export function validateExecutionSnapshot(code: CodeVersion, run: Run): void {
  if (
    !isDeepStrictEqual(
      createExecutionSnapshot(code, run.executionMode ?? 'run'),
      run.executionSnapshot,
    )
  )
    throw new DomainError({
      status: 422,
      code: 'execution_snapshot_mismatch',
      message: 'the pinned execution of the run does not match the code version',
    });
}
