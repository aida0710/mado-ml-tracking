import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { CommentCreate, CommentTargetType, CommentUpdate } from '@mmt/contracts';
import { commentPageSchema, commentSchema } from '@mmt/contracts/schemas';
import { z } from 'zod';
import { encodeId, projectPath } from './http';

// 続きを読むたびにサーバーの1ページを取るよう、APIの既定値に合わせる。
export const COMMENT_PAGE_SIZE = 100;

export interface CommentTarget {
  targetType: CommentTargetType;
  targetId: string;
}

const commentsPath = (projectId: string) => `${projectPath(projectId)}/comments`;
const commentPath = (projectId: string, commentId: string) =>
  `${commentsPath(projectId)}/${encodeId(commentId)}`;

export const commentsApi = {
  list: (
    projectId: string,
    target: CommentTarget,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams({
      targetType: target.targetType,
      targetId: target.targetId,
      limit: String(COMMENT_PAGE_SIZE),
    });
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${commentsPath(projectId)}?${query}`, { schema: commentPageSchema, init: { signal } });
  },
  create: (projectId: string, body: CommentCreate) =>
    requestJson(commentsPath(projectId), { schema: commentSchema, init: jsonRequestInit('POST', body) }),
  update: (projectId: string, commentId: string, body: CommentUpdate) =>
    requestJson(commentPath(projectId, commentId), { schema: commentSchema, init: jsonRequestInit('PATCH', body) }),
  remove: (projectId: string, commentId: string) =>
    requestJson(commentPath(projectId, commentId), { schema: z.undefined(), init: { method: 'DELETE' } }),
};
