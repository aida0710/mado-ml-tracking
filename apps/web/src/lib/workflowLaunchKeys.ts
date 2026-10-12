import { createRandomId } from './randomId';

/** One intended start of a workflow: a version, and the execution it resumes, if any. */
export interface WorkflowLaunchIntent {
  revision: number;
  resumeFromExecutionId?: string;
}

export interface WorkflowLaunchKeys {
  /** The idempotency key to send for this intent. */
  keyFor: (intent: WorkflowLaunchIntent) => string;
  /** The API answered with an execution: the next start of any intent is a new one. */
  markAccepted: () => void;
}

/**
 * The idempotency keys of workflow starts. A start whose answer did not arrive may still have
 * been accepted, so the same intent is sent again with the same key until the API answers with an
 * execution; then the API returns that execution instead of starting a second one. Another intent
 * gets a new key.
 */
export function createWorkflowLaunchKeys(createKey: () => string = createRandomId): WorkflowLaunchKeys {
  let unanswered: { intent: string; key: string } | null = null;
  return {
    keyFor: ({ revision, resumeFromExecutionId }) => {
      const intent = `${revision}:${resumeFromExecutionId ?? ''}`;
      if (unanswered?.intent !== intent) unanswered = { intent, key: createKey() };
      return unanswered.key;
    },
    markAccepted: () => {
      unanswered = null;
    },
  };
}
