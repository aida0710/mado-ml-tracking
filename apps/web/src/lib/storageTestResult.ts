import type { StorageTestResult } from '@mmt/contracts';

/** Whether every step of a storage connection test succeeded. */
export function hasStorageTestPassed(result: StorageTestResult): boolean {
  return result.steps.every((step) => step.ok);
}
