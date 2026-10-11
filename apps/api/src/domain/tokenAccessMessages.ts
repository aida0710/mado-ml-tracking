import { TOKEN_PURPOSE_LABELS, TOKEN_PURPOSE_SCOPES, TOKEN_PURPOSES } from '@mmt/contracts';

/**
 * What a client is told when its API token cannot do what it asked, written so a person who copied
 * the settings from the screen can fix them: which scope is missing and where a token with it is
 * issued, or which Project the token belongs to.
 */

/**
 * The purpose to choose in the token dialog for a token that has the scope: the first one listed
 * that includes it, so the message names a choice the person will see. None includes admin.
 */
function purposeIncludingScope(scope: string): string | null {
  const purpose = TOKEN_PURPOSES.find((candidate) =>
    TOKEN_PURPOSE_SCOPES[candidate].some((included) => included === scope),
  );
  return purpose ? TOKEN_PURPOSE_LABELS[purpose] : null;
}

export function insufficientScopeMessage(scope: string): string {
  const purpose = purposeIncludingScope(scope);
  const howToIssue = purpose
    ? `［プロジェクト設定］の［API tokenを発行］で用途「${purpose}」を選び、tokenを発行し直してください`
    : `ProjectのAdminに、${scope}を含むtokenの発行を頼んでください`;
  return `API tokenのscopeが不足しています。この操作には${scope}が要ります。${howToIssue}`;
}

export function tokenProjectMismatchMessage(tokenProjectName: string | null): string {
  const owner = tokenProjectName ? `Project「${tokenProjectName}」` : '別のProject';
  return `API tokenのprojectが一致しません。このtokenは${owner}用です。接続先のProject ID（MMT_PROJECT_ID・MLFLOW_TRACKING_URI）を確かめるか、接続先のProjectで発行したtokenを使ってください`;
}
