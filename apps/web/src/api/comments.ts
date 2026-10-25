import type {
  Comment,
  CommentCreate,
  CommentPage,
  CommentTargetType,
  CommentUpdate,
} from '@mmt/contracts';
import { assertCursorPage, encodeId, jsonRequest, projectPath, request } from './http';

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
  list: async (
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
    const page = await request<CommentPage>(`${commentsPath(projectId)}?${query}`, { signal });
    assertCursorPage(page);
    return page;
  },
  create: (projectId: string, body: CommentCreate) =>
    request<Comment>(commentsPath(projectId), jsonRequest('POST', body)),
  update: (projectId: string, commentId: string, body: CommentUpdate) =>
    request<Comment>(commentPath(projectId, commentId), jsonRequest('PATCH', body)),
  remove: (projectId: string, commentId: string) =>
    request<void>(commentPath(projectId, commentId), { method: 'DELETE' }),
};
