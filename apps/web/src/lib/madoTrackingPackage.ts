import { shellQuote } from './shellSnippet';

// Where pages/tracking/sdk.md#install installs mado-tracking from: the python/ directory of the
// public repository. The package carries the SDK and the `mado-tracking` and
// `mado-tracking-worker` commands.
const MADO_TRACKING_SOURCE =
  'git+https://github.com/aida0710/mado-ml-tracking.git#subdirectory=python';

/**
 * Commands that create a virtual environment and install mado-tracking into it. `extras` are the
 * optional dependencies, such as `telemetry` for GPU and memory metrics.
 */
export function madoTrackingInstallLines({
  venvDirectory,
  extras = [],
}: {
  venvDirectory: string;
  extras?: string[];
}): string[] {
  const requirement = `mado-tracking${extras.length ? `[${extras.join(',')}]` : ''} @ ${MADO_TRACKING_SOURCE}`;
  return [`python3 -m venv ${venvDirectory}`, `${venvDirectory}/bin/pip install ${shellQuote(requirement)}`];
}
