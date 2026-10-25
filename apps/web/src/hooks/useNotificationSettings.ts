import type {
  NotificationChannelCreate,
  NotificationChannelPatch,
  NotificationRuleCreate,
} from '@mmt/contracts';
import { notificationsApi } from '../api/notifications';
import { trackingApi } from '../api/tracking';
import { useQuery } from './useQuery';

/**
 * Projectの通知設定の通知先・ルール・最近の配信・Experiment（ルールの絞り込み用）。利用者が
 * Project adminでなければnullを渡す。APIが断るため。
 */
export function useNotificationSettings(projectId: string | null) {
  const channels = useQuery({ key: projectId && `${projectId}:notification-channels`, load: (signal) =>
    notificationsApi.projectChannels(projectId!, signal),
  });
  const rules = useQuery({ key: projectId && `${projectId}:notification-rules`, load: (signal) =>
    notificationsApi.rules(projectId!, signal),
  });
  const deliveries = useQuery({ key: projectId && `${projectId}:notification-deliveries`, load: (signal) =>
    notificationsApi.deliveries(projectId!, signal),
  });
  const experiments = useQuery({ key: projectId && `${projectId}:notification-experiments`, load: (signal) =>
    trackingApi.experiments(projectId!, signal),
  });
  return {
    channels,
    rules,
    deliveries,
    experiments,
    createChannel: (body: NotificationChannelCreate) => notificationsApi.createChannel(body),
    updateChannel: (channelId: string, body: NotificationChannelPatch) =>
      notificationsApi.updateChannel(channelId, body),
    testChannel: (channelId: string) => notificationsApi.testChannel(channelId),
    createRule: (body: NotificationRuleCreate) => notificationsApi.createRule(projectId!, body),
    setRuleEnabled: (ruleId: string, enabled: boolean) =>
      notificationsApi.setRuleEnabled(projectId!, ruleId, enabled),
  };
}

export type NotificationSettingsState = ReturnType<typeof useNotificationSettings>;
