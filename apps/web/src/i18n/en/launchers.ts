export const launchersText = {
  launchers: 'Launchers',
  launchersDescription:
    'Launchers connect to automatic submission computers over SSH and submit jobs. Issue one token per launcher and store it in token_file on the launcher host. The launcher reads computer, key, and job shell settings from the web application.',
  newLauncher: 'Register launcher',
  noLaunchers: 'No launchers registered yet.',
  launcherActive: 'Enabled',
  launcherRevoked: 'Revoked',
  launcherLastSeen: 'Last response',
  launcherNeverSeen: 'No response yet',
  launcherTokenPrefix: 'Token prefix',
  launcherCreatedAt: 'Registered at',
  launcherRotateToken: 'Rotate token',
  launcherRotateTitle: 'Rotate launcher token',
  launcherRevoke: 'Revoke',
  launcherRevokeTitle: 'Revoke launcher',
  launcherTokenOnce:
    'This token is shown only once. Save it in token_file on the launcher host before closing (mode 600, owned by the launcher user).',
  launcherTokenValue: 'Launcher token',
  launcherConfigExample: 'Example launcher.toml',
  launcherConfigExampleHint:
    'launcher.toml contains only startup settings. The launcher reads assigned computers, keys, and job shells from the web application.',
  launcherConfigApiUrlComment:
    "URL of this app reachable by the launcher (prefilled with this page's URL). If the launcher runs in the same docker compose as the API, use the API service's URL",
  launcherStart: 'Install and start the launcher',
  launcherStartHint:
    'Put the token above in token_file and launcher.toml at the --config path of the command below, then run it. With docker compose, run docker compose --profile launcher up -d launcher. Once started, the launcher is running if “Last response” in the list updates.',
  launcherStartCommands: 'Commands to run on the launcher host',
  launcherConfigTokenFileComment: 'File containing only the token above (mode 600, owned by the launcher user)',
  launcherConfigStateComment:
    'Directory for private keys, known_hosts, and submission records. Use a separate directory per launcher and retain it across restarts; deleting it requires registering keys again.',
  launcherConfigPollComment: 'Interval for reading configuration and receiving submissions (seconds)',
  launcherConfigRegistryComment:
    'Optional: image-pull credentials shared by all sites (JSON {"username": ..., "password": ...}, mode 600)',
} as const;

// Text that embeds values.
export const launchersTextTemplates = {
  launcherTokenTitle: (name: string) => `Token for launcher “${name}”`,
  launcherRotateConfirm: (name: string) =>
    `Revoke the current token of “${name}” and issue a new one? This launcher cannot submit jobs until its token_file is updated.`,
  launcherRevokeConfirm: (name: string) =>
    `Revoke “${name}” and its token? Jobs on computers using this launcher will wait until another launcher is selected.`,
  launcherConfigHeader: (name: string) => `Settings for mado-tracking-launcher “${name}”`,
};
