import { clientApiUrl } from './clientApiUrl';
import { madoTrackingInstallLines } from './madoTrackingPackage';
import { exportLine, joinLines, promptedSecretLines } from './shellSnippet';

// ログインノードには次の投入のためにコマンドを置いたままにするので、1つのプロジェクトの.venvでなく
// ホームディレクトリに入れてPATHに通す。
const SUBMIT_CLI_VENV_DIRECTORY = '~/.venvs/mado-tracking';

/** 手動投入のsiteで、依頼した人が`mado-tracking submit`の前に一度だけ実行するもの。 */
export interface SubmitCliSetupSnippets {
  install: string;
  environment: string;
}

export function buildSubmitCliSetupSnippets(origin: string): SubmitCliSetupSnippets {
  return {
    install: joinLines([
      ...madoTrackingInstallLines({ venvDirectory: SUBMIT_CLI_VENV_DIRECTORY }),
      `export PATH="${SUBMIT_CLI_VENV_DIRECTORY.replace(/^~/, '$HOME')}/bin:$PATH"`,
    ]),
    environment: joinLines([
      exportLine('MMT_API_URL', clientApiUrl(origin)),
      ...promptedSecretLines('MMT_API_TOKEN'),
    ]),
  };
}
