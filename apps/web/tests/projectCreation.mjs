import { openProjectSwitcher } from './projectSwitcher.mjs';

/**
 * Projectの作成のダイアログを開く: Projectの切り替えの最後の項目から開く。Projectが1つも無い
 * 利用者では、最初の画面のボタンから開く。
 */
export async function openProjectCreation(page, { base, projects }) {
  const [firstProject] = projects;
  if (!firstProject) {
    await page.goto(base);
    await page.getByRole('button', { name: 'プロジェクトを作成', exact: true }).click();
    return;
  }
  await page.goto(`${base}/projects/${firstProject.id}/experiments`);
  const listbox = await openProjectSwitcher(page);
  await listbox.getByRole('option', { name: 'プロジェクトを作成', exact: true }).click();
}
