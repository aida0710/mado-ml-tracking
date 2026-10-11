/**
 * The highest attempt number in a Job's retry chain. maxAttempts (the automatic retries) cannot
 * ask for more, a person may retry a Job past its maxAttempts but not past this, and the API's
 * lookup that follows a retry chain back to its automation execution stops here.
 */
export const MAX_JOB_ATTEMPTS = 100;

/** maxAttempts when a request leaves it out; the worker's retry policy from before it was asked. */
export const DEFAULT_JOB_ATTEMPTS = 3;
