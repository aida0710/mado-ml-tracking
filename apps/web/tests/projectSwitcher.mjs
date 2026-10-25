// サイドバーの上端、狭い画面ではプロジェクトバーにあるProjectの切り替え。

/** 開いているProjectを示し、切り替えを開くボタン。 */
export const projectSwitcherButton = (page) =>
  page.getByRole('button', { name: /^プロジェクト\s/ }).and(page.locator('[aria-haspopup="listbox"]'));

/** 切り替えを開き、そのProjectの一覧を返す。 */
export async function openProjectSwitcher(page) {
  await projectSwitcherButton(page).click();
  const listbox = page.getByRole('listbox', { name: 'プロジェクト', exact: true });
  await listbox.waitFor();
  return listbox;
}

/** 切り替えから、名前で別のProjectを開く。 */
export async function switchProject(page, name) {
  const listbox = await openProjectSwitcher(page);
  await listbox.getByRole('option').filter({ hasText: name }).first().click();
}
