export const savedViewsText = {
  savedViews: 'Views',
  savedViewDefault: 'Default view',
  savedViewPrivateGroup: 'Personal',
  savedViewProjectGroup: 'Shared with project',
  savedViewNone: 'No saved views yet',
  savedViewUnsaved: 'Unsaved changes',
  savedViewSave: 'Save changes',
  savedViewSaveAs: 'Save as',
  savedViewRename: 'Rename',
  savedViewDelete: 'Delete',
  savedViewDeleteTitle: 'Delete view',
  savedViewCopyUrl: 'Copy URL',
  savedViewUrlCopied: 'URL copied',
  savedViewName: 'View name',
  savedViewVisibility: 'Visibility',
  savedViewVisibilityPrivate: 'Only me',
  savedViewVisibilityPrivateHint: 'Hidden from other members in both lists and direct URLs.',
  savedViewVisibilityProject: 'Shared with project',
  savedViewVisibilityProjectHint: 'All members of this project can open it.',
  savedViewNotFound:
    "This view was deleted or is inaccessible, including another user's personal view. Showing the default view.",
  savedViewUnsupportedVersion:
    'This view uses a newer format and cannot be opened here. Showing the default view.',
  savedViewInvalid: 'Could not read this view. Showing the default view.',
  savedViewShared: 'Shared',
  runDescriptionColumn: 'Description',
  runColumnResize: 'Resize column',
  runColumnMove: 'Move column (Alt+←/→)',
} as const;

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const savedViewsTextTemplates = {
  savedViewDeleteMessage: (name: string) =>
    `Delete view “${name}”? Its URL will show the default view afterward.`,
  savedViewCurrent: (name: string) => `View: ${name}`,
};
