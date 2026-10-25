export type CommentTargetType = 'run' | 'model_version' | 'report';

export interface CommentAuthor {
  id: string;
  displayName: string;
}

/**
 * スレッドの中の1つのコメント。返信は1段だけ。parentCommentIdはスレッドのルートではnull、
 * 返信では必ずルートを指す。削除したコメントはbody=nullとしてその位置に残る。
 */
export interface Comment {
  id: string;
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  parentCommentId: string | null;
  body: string | null;
  author: CommentAuthor;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export interface CommentCreate {
  targetType: CommentTargetType;
  targetId: string;
  parentCommentId?: string | null;
  body: string;
}

export interface CommentUpdate {
  body: string;
}

/** スレッドの順に並べた1ページ。nextCursorは次に`cursor`として渡すid。 */
export interface CommentPage {
  items: Comment[];
  nextCursor: string | null;
}

/** Runの説明はこのタグに保存し、MLflowのクライアントが同じ値を読み書きできるようにする。 */
export const RUN_NOTE_TAG = 'mlflow.note.content';
/** MLflowのタグの値の上限と同じ。MLflowから書いたノートも、ネイティブの側で必ず編集できる。 */
export const RUN_NOTE_MAX_LENGTH = 8000;
export const COMMENT_MAX_LENGTH = 20000;

export interface RunNoteUpdate {
  content: string;
}

/** Runに説明が無ければcontentは''。 */
export interface RunNote {
  runId: string;
  content: string;
}
