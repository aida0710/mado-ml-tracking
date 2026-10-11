import { clientApiUrl } from './clientApiUrl';
import { madoTrackingInstallLines } from './madoTrackingPackage';
import { exportLine, joinLines, promptedSecretLines } from './shellSnippet';

// A login node keeps the command for the next submission, so it goes into the home directory and
// onto PATH rather than into one project's .venv.
const SUBMIT_CLI_VENV_DIRECTORY = '~/.venvs/mado-tracking';

/** What a requester runs once on a manual site before `mado-tracking submit`. */
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
