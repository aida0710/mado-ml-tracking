import { shellQuote } from './shellSnippet';

// pages/tracking/sdk.md#installがmado-trackingをインストールする元。公開リポジトリの
// python/ディレクトリ。パッケージにはSDKと、`mado-tracking`と`mado-tracking-worker`の
// コマンドが入っている。
const MADO_TRACKING_SOURCE =
  'git+https://github.com/aida0710/mado-ml-tracking.git#subdirectory=python';

/**
 * 仮想環境を作り、そこへmado-trackingをインストールするコマンド。`extras`は任意の依存で、
 * GPUとメモリのメトリクス用の`telemetry`などがある。
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
