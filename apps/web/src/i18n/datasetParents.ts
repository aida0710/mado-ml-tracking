import * as english from './en/datasetParents';
import { localized } from './localized';

export const datasetParentsText = localized(
  {
    addParents: '親データ版を追加',
    parentHistory: '親の追記履歴',
    parentHistoryHint: '生成元を後から補った記録です。学習中のデータ変更とは別の履歴です。',
    parentHistoryEmpty: '登録後に追加した親はありません。',
    parentVersion: '親データ版',
    selectedParents: '照合済みの親データ版',
    reason: '親を追加する理由',
    evidence: '照合根拠（JSON）',
    evidenceColumn: '照合根拠',
    createdBy: '追加した人',
    createdAt: '追加日時',
    addParentsHint:
      'この版と学習との紐付けを保って、確認できた生成元を追加します。一度追加した親と根拠は上書きできません。',
  },
  english.datasetParentsText,
);
