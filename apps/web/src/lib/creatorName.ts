/** Who created a record (a Run, an automation rule); the id once the user record is gone. */
export const creatorName = (record: { createdBy: string; createdByName: string | null }) =>
  record.createdByName ?? record.createdBy;
