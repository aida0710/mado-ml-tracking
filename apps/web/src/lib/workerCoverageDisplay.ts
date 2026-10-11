import type { WorkerCoverage } from './workerCoverage';
import { workerCoverageText, workerCoverageTextTemplates } from '../i18n/workerCoverage';

/** The short state for a table cell or a choice: how many workers answer, or that none does. */
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
