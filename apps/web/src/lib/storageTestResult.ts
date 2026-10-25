import type { StorageTestResult } from '@mmt/contracts';

/** 保存先の接続テストのすべての段階が成功したかどうか。 */
export function hasStorageTestPassed(result: StorageTestResult): boolean {
  return result.steps.every((step) => step.ok);
}
