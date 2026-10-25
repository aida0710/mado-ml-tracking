import { describe, expect, it } from 'vitest';
import { buildLauncherStartCommands, EXAMPLE_LAUNCHER_CONFIG_PATH } from './launcherStartCommands';

describe('ランチャーの入れ方と起動のコマンド', () => {
  it('mado-trackingを仮想環境に入れ、launcher.tomlを指定してランチャーを起動する', () => {
    const lines = buildLauncherStartCommands().split('\n');
    expect(lines[0]).toMatch(/^python3 -m venv /);
    expect(lines[1]).toContain("pip install 'mado-tracking @ git+https://");
    expect(lines.at(-1)).toMatch(/\/bin\/mado-tracking-launcher --config /);
    expect(lines.at(-1)).toContain(EXAMPLE_LAUNCHER_CONFIG_PATH);
    // tokenはtoken_fileに置いたままにし、コマンドには決して含めない。
    expect(buildLauncherStartCommands()).not.toMatch(/token/i);
  });
});
