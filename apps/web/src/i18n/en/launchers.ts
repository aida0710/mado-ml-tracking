export const launchersText = {
  launchers: "Launchers",
  launchersDescription:
    "Launchers connect to automatic submission computers over SSH and submit jobs. Issue one token per launcher and store it in token_file on the launcher host. The launcher reads computer, key, and job shell settings from the web application.",
  newLauncher: "Register launcher",
  noLaunchers: "No launchers registered yet.",
  launcherStatus: "Status",
  launcherActive: "Enabled",
  launcherRevoked: "Revoked",
  launcherLastSeen: "Last response",
  launcherNeverSeen: "No response yet",
  launcherTokenPrefix: "Token prefix",
  launcherCreatedAt: "Registered at",
  launcherRotateToken: "Rotate token",
  launcherRotateTitle: "Rotate launcher token",
  launcherRevoke: "Revoke",
  launcherRevokeTitle: "Revoke launcher",
  launcherTokenOnce:
    "This token is shown only once. Save it in token_file on the launcher host before closing (mode 600, owned by the launcher user).",
  launcherTokenValue: "Launcher token",
  launcherConfigExample: "Example launcher.toml",
  launcherConfigExampleHint:
    "launcher.toml contains only startup settings. The launcher reads assigned computers, keys, and job shells from the web application.",
  launcherConfigApiUrlComment:
    "Tracking URL reachable by the launcher. In the same Compose network, use the API URL (e.g. http://api:4182).",
  launcherConfigTokenFileComment: "File containing only the token above (mode 600, owned by the launcher user)",
  launcherConfigStateComment:
    "Directory for private keys, known_hosts, and submission records. Use a separate directory per launcher and retain it across restarts; deleting it requires registering keys again.",
  launcherConfigPollComment: "Interval for reading configuration and receiving submissions (seconds)",
  launcherConfigRegistryComment:
    "Optional: image-pull credentials shared by all sites (JSON {\"username\": ..., \"password\": ...}, mode 600)",
} as const;

// Text that embeds values.
export const launchersTextTemplates = {
  launcherTokenTitle: (name: string) => `Token for launcher “${name}”`,
  launcherRotateConfirm: (name: string) =>
    `Revoke “${name}”'s current token and issue a new one? This launcher cannot submit jobs until its token_file is updated.`,
  launcherRevokeConfirm: (name: string) =>
    `Revoke “${name}” and its token? Jobs on computers using this launcher will wait until another launcher is selected.`,
  launcherConfigHeader: (name: string) => `Settings for mado-tracking-launcher “${name}”`,
};
