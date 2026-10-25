import type { ProjectGroupBinding } from '@mmt/contracts';

/**
 * 新しく入力したgroup名が置き換えることになる付与。PUT /group-bindings/:groupは追加と変更を
 * 兼ねるので、追加のダイアログはまずこれを確かめ、黙ってロールを上書きしないようにする。
 * Authentikのgroup名は、APIが保存するのと同じく、そのまま比べる。
 */
export function findExistingGroupBinding(
  bindings: readonly ProjectGroupBinding[],
  groupName: string,
): ProjectGroupBinding | undefined {
  const typedName = groupName.trim();
  return bindings.find((binding) => binding.group === typedName);
}
