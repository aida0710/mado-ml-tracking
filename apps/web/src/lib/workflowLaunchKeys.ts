import { createRandomId } from './randomId';

/** ワークフローを始める1回の意図。バージョンと、再開するなら再開元の実行。 */
export interface WorkflowLaunchIntent {
  revision: number;
  resumeFromExecutionId?: string;
}

export interface WorkflowLaunchKeys {
  /** この意図で送るidempotency key。 */
  keyFor: (intent: WorkflowLaunchIntent) => string;
  /** APIがこの意図に実行で答えた。この意図をまた始めるときは、新しい開始として扱う。 */
  markAccepted: (intent: WorkflowLaunchIntent) => void;
}

function intentId({ revision, resumeFromExecutionId }: WorkflowLaunchIntent): string {
  return `${revision}:${resumeFromExecutionId ?? ''}`;
}

/**
 * ワークフローの開始のidempotency key。意図ごとに1つ。応答が届かなかった開始も、
 * 受け付けられているかもしれない。そのため、その意図はAPIが実行で答えるまで同じキーで送り直す。
 * 間にほかの意図を始めていても同じ。APIはそのとき、2つ目の実行を始めずに最初の実行を返す。
 */
export function createWorkflowLaunchKeys(createKey: () => string = createRandomId): WorkflowLaunchKeys {
  const unansweredKeys = new Map<string, string>();
  return {
    keyFor: (intent) => {
      const id = intentId(intent);
      const key = unansweredKeys.get(id) ?? createKey();
      unansweredKeys.set(id, key);
      return key;
    },
    markAccepted: (intent) => {
      unansweredKeys.delete(intentId(intent));
    },
  };
}
