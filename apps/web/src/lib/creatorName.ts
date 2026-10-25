/** 記録（Run、自動実行ルール）を作った人。ユーザーの記録が無くなった後はid。 */
export const creatorName = (record: { createdBy: string; createdByName: string | null }) =>
  record.createdByName ?? record.createdBy;
