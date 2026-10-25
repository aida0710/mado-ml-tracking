import { formatEnglishCount } from '../formatEnglishCount';
export const commentsText = {
  markdownWrite: 'Edit',
  markdownPreview: 'Preview',
  markdownPreviewEmpty: 'No content to preview',
  markdownHint: 'Supports Markdown, including tables, checklists, and code.',
  markdownUnsafeLink: 'This link type cannot be opened and is shown as text',
  markdownExternalImage: 'External images are shown as links without loading them',
  runDescription: 'Description',
  runDescriptionEmpty: 'No description yet',
  runDescriptionEdit: 'Edit description',
  runDescriptionPlaceholder: 'Describe the purpose, conditions, and observations',
  comments: 'Comments',
  commentsEmpty: 'No comments yet',
  commentsLoadMore: 'Load more',
  commentPlaceholder: 'Write a comment',
  commentReplyPlaceholder: 'Write a reply',
  commentPost: 'Post',
  commentReply: 'Reply',
  commentEdit: 'Edit',
  commentDelete: 'Delete',
  commentDeleteTitle: 'Delete comment',
  commentDeleteMessage: 'Delete this comment? The thread will show “Deleted”.',
  commentDeleted: 'Deleted',
  commentEdited: 'Edited',
  commentBodyRequired: 'Enter content',
  commentActions: 'Comment actions',
} as const;

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const commentsTextTemplates = {
  markdownRemaining: (remaining: number) =>
    remaining >= 0
      ? `${formatEnglishCount(remaining, 'character')} remaining`
      : `${formatEnglishCount(-remaining, 'character')} over the limit`,
  commentEditedAt: (editedAt: string) => `Edited (${editedAt})`,
};
