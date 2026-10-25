// ビルドの時にvite.config.tsのdefineが値に置き換える。defineの無い場所（vitest）では、どれも未定義なので
// typeofで確かめてから読む。
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __GIT_DATE__: string;

/** このWebの版（apps/web/package.jsonのversion）。ビルドの外ではnull。 */
export const APP_VERSION: string | null = typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__;

/** ビルドしたコミットの完全なハッシュ。gitもビルド引数も無かった開発中のビルドでは空。 */
export const GIT_COMMIT: string = typeof __GIT_COMMIT__ === 'undefined' ? '' : __GIT_COMMIT__;

/** そのコミットの日時（ISO 8601）。分からなければ空。 */
export const GIT_COMMIT_DATE: string = typeof __GIT_DATE__ === 'undefined' ? '' : __GIT_DATE__;

export const REPOSITORY_URL = 'https://github.com/aida0710/mado-ml-tracking';

// GitHubのコミットのURLは短いハッシュでは引けないことがあるので、完全なハッシュで作る。
export const commitUrl = (commit: string): string => `${REPOSITORY_URL}/commit/${commit}`;
