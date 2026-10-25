import type { WorkerCoverage } from './workerCoverage';
import { workerCoverageText, workerCoverageTextTemplates } from '../i18n/workerCoverage';

/** 表のセルや選択肢に出す短い状態。応答するworkerの数か、応答するものが無いこと。 */
export function workerCoverageLabel(coverage: WorkerCoverage): string {
  switch (coverage.state) {
    case 'online':
      return workerCoverageTextTemplates.workerCoverageOnline(coverage.onlineCount);
    case 'offline':
      return workerCoverageText.workerCoverageOffline;
    case 'none':
      return workerCoverageText.workerCoverageNone;
    case 'notNeeded':
      return workerCoverageText.workerCoverageNotNeeded;
  }
}
