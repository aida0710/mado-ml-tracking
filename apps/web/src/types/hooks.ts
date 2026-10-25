import type { ComputeTarget } from '@mmt/contracts';
import type { ExecutionCatalog } from './executionCatalog';

/** フックのフォームで選べるもの。Projectに登録された項目と、コンピュータ。 */
export interface HookCatalog {
  registry: ExecutionCatalog;
  targets: ComputeTarget[];
}
