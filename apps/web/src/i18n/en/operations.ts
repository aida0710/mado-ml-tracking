import { formatEnglishCount } from '../formatEnglishCount';

// 上部バーの運用アラートのバッジ。
export const operationsText = {
  operationsAlerts: 'Operations alerts',
  operationsAlertsNone: 'No open operations alerts',
  operationsAlertsLoadFailed: 'Could not load operations alerts',
  operationsAlertOpenedAt: 'Detected',
  operationsAlertsScope:
    'Alerts for projects you are a member of (all projects for global administrators).',
  operationsAlertUnknownProject: '(Loading project)',
} as const;

export const operationsTextTemplates = {
  operationsAlertCount: (count: number) => formatEnglishCount(count, 'operations alert'),
  operationsAlertCountAtLeast: (count: number) =>
    `At least ${formatEnglishCount(count, 'operations alert')}`,
  operationsAlertBadgeAtLeast: (count: number) => `${count}+`,
};
