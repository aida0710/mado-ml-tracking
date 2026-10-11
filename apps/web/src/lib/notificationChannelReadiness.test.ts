import { describe, expect, it } from 'vitest';
import type { NotificationChannel } from '@mmt/contracts';
import {
  defaultRuleChannelId,
  missingEnvironmentNames,
  referencedEnvironmentNames,
} from './notificationChannelReadiness';

const values = {
  urlEnv: ' MMT_NOTIFICATION_SLACK_URL ',
  secretEnv: 'MMT_NOTIFICATION_OPS_SECRET',
  recipients: 'ml@example.com',
};

function channel(id: string, configured: boolean): NotificationChannel {
  return {
    id,
    projectId: null,
    kind: 'slack_webhook',
    name: id,
    urlEnv: 'MMT_NOTIFICATION_SLACK_URL',
    secretEnv: null,
    recipients: [],
    enabled: true,
    configured,
    createdBy: 'user-1',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
}

describe('通知先の送信設定の確かめ', () => {
  it('種類ごとに参照する変数名だけを取り出す（Slackはurl、Webhookはurlと鍵、メールは無し）', () => {
    expect(referencedEnvironmentNames('slack_webhook', values)).toEqual([
      'MMT_NOTIFICATION_SLACK_URL',
    ]);
    expect(referencedEnvironmentNames('webhook', values)).toEqual([
      'MMT_NOTIFICATION_SLACK_URL',
      'MMT_NOTIFICATION_OPS_SECRET',
    ]);
    expect(referencedEnvironmentNames('email', values)).toEqual([]);
    expect(referencedEnvironmentNames('webhook', { urlEnv: '', secretEnv: '' })).toEqual([]);
  });

  it('API serverに無い変数名だけを返し、一覧を読み込む前は何も返さない', () => {
    const referenced = ['MMT_NOTIFICATION_SLACK_URL', 'MMT_NOTIFICATION_TYPO_URL'];
    expect(missingEnvironmentNames(referenced, ['MMT_NOTIFICATION_SLACK_URL'])).toEqual([
      'MMT_NOTIFICATION_TYPO_URL',
    ]);
    expect(missingEnvironmentNames(referenced, undefined)).toEqual([]);
  });

  it('新しいルールの通知先は、送れる通知先を先に選び、無ければ最初の通知先にする', () => {
    expect(defaultRuleChannelId([channel('a', false), channel('b', true)])).toBe('b');
    expect(defaultRuleChannelId([channel('a', false), channel('c', false)])).toBe('a');
    expect(defaultRuleChannelId([])).toBe('');
  });
});
