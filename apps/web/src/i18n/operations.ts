import * as english from './en/operations';
import { localized } from './localized';

// 上部バーの運用アラートのバッジ。
export const operationsText = localized({
  operationsAlerts: '運用アラート',
  operationsAlertsNone: '開いている運用アラートはありません',
  operationsAlertsLoadFailed: '運用アラートを読み込めませんでした',
  operationsAlertOpenedAt: '検知',
  operationsAlertsScope:
    'メンバーになっているプロジェクトのアラートです（全体管理者はすべてのプロジェクト）。',
  operationsAlertUnknownProject: '（読み込み中のプロジェクト）',
} as const, english.operationsText);

export const operationsTextTemplates = localized({
  operationsAlertCount: (count: number) => `運用アラート ${count}件`,
  // ベルは1回の要求で返る上限の件数を受け取ったので、未解決のものがほかにもありうる。
  operationsAlertCountAtLeast: (count: number) => `運用アラート ${count}件以上`,
  operationsAlertBadgeAtLeast: (count: number) => `${count}+`,
}, english.operationsTextTemplates);
