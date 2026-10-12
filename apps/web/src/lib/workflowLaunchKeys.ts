import { createRandomId } from './randomId';

/** One intended start of a workflow: a version, and the execution it resumes, if any. */
export interface WorkflowLaunchIntent {
  revision: number;
  resumeFromExecutionId?: string;
}

export interface WorkflowLaunchKeys {
  /** The idempotency key to send for this intent. */
  keyFor: (intent: WorkflowLaunchIntent) => string;
  /** The API answered this intent with an execution: its next start is a new one. */
  markAccepted: (intent: WorkflowLaunchIntent) => void;
}

function intentId({ revision, resumeFromExecutionId }: WorkflowLaunchIntent): string {
  return `${revision}:${resumeFromExecutionId ?? ''}`;
}

/**
 * The idempotency keys of workflow starts, one per intent. A start whose answer did not arrive may
 * still have been accepted, so that intent is sent again with the same key until the API answers
 * it with an execution, even when other intents were started in between; the API then returns
 * the first execution instead of starting a second one.
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
