import { describe, expect, it } from 'vitest';
import {
  buildConnectionPatch,
  buildNewComputerCreate,
  buildSetupPatch,
  hasConnectionChanges,
} from './computerSetupInput';
import { newTargetFormValues, targetFormValues } from './targetInput';
import { computeTargetDetails } from '../../tests/fixtures/execution';

const connection = {
  ...newTargetFormValues({ canAddSshOrLocal: true }),
  name: 'GPU server',
  host: 'gpu.invalid',
  username: 'mmt',
  sshKeyPath: '/home/worker/.ssh/id_ed25519',
  knownHostsPath: '/home/worker/.ssh/known_hosts',
};

describe('コンピュータの2段の保存', () => {
  it('1段目は接続だけを入れて、作業ディレクトリとPythonが空のまま無効で登録する', () => {
    expect(buildNewComputerCreate({ ...connection, enabled: 'true' })).toMatchObject({
      name: 'GPU server',
      executor: 'ssh',
      host: 'gpu.invalid',
      workDirectory: '',
      pythonExecutable: '',
      enabled: false,
      visibility: 'private',
    });
  });

  it('接続と接続後の設定は、それぞれの項目だけを送る', () => {
    const values = {
      ...targetFormValues(computeTargetDetails),
      host: 'gpu2.invalid',
      workDirectory: '/large/mmt',
      gpuIds: '0\n1\n2',
    };
    const connectionPatch = buildConnectionPatch(values, computeTargetDetails);
    expect(connectionPatch).toMatchObject({ host: 'gpu2.invalid', name: 'Container worker' });
    expect(connectionPatch).not.toHaveProperty('workDirectory');
    expect(connectionPatch).not.toHaveProperty('gpuIds');
    const setupPatch = buildSetupPatch(values, computeTargetDetails);
    expect(setupPatch).toMatchObject({ workDirectory: '/large/mmt', gpuIds: ['0', '1', '2'] });
    expect(setupPatch).not.toHaveProperty('host');
    expect(setupPatch).not.toHaveProperty('visibility');
  });

  it('接続の変更は入力のまま比べるので、設定の書きかけがあっても判定できる', () => {
    const saved = targetFormValues(computeTargetDetails);
    expect(hasConnectionChanges(saved, computeTargetDetails)).toBe(false);
    expect(hasConnectionChanges({ ...saved, maxConcurrentJobs: '' }, computeTargetDetails)).toBe(
      false,
    );
    expect(hasConnectionChanges({ ...saved, port: '2222' }, computeTargetDetails)).toBe(true);
  });
});
