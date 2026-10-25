import { describe, expect, it } from 'vitest';
import {
  applyCheckToSetupValues,
  defaultConcurrentJobs,
  isConnectionReached,
  preferredPython,
  toggleGpuId,
  withConcurrencyFollowingGpus,
} from './computerSetupValues';
import { newTargetFormValues } from './targetInput';
import { setupCheck, setupCheckResult } from '../../tests/fixtures/computerSetup';

const newComputer = newTargetFormValues({ canAddSshOrLocal: true });

describe('接続後の設定の自動入力', () => {
  it('確認の結果からCPU・動いたRuntime・見つかったGPUの全部・3.11以上のPython・GPUの数の同時実行数を入れる', () => {
    expect(applyCheckToSetupValues(newComputer, setupCheckResult)).toMatchObject({
      cpuArch: 'arm64',
      runtimeKinds: ['python', 'docker'],
      gpuIds: '0\n1',
      // そのコンピュータでは3.9が先に見つかるが、Jobには3.11以降が要る。
      pythonExecutable: '/usr/bin/python3',
      maxConcurrentJobs: '2',
    });
  });

  it('入力済みのPythonは変えず、確認で分からなかった項目はそのまま', () => {
    const typed = { ...newComputer, pythonExecutable: '/opt/py/bin/python', cpuArch: 'amd64' };
    const unknownHost = {
      ...setupCheckResult,
      host: { ...setupCheckResult.host, cpuArch: null, machine: 'riscv64' },
      gpus: null,
      runtimeKinds: [],
    };
    expect(applyCheckToSetupValues(typed, unknownHost)).toMatchObject({
      pythonExecutable: '/opt/py/bin/python',
      cpuArch: 'amd64',
      runtimeKinds: ['python'],
      gpuIds: '',
    });
  });

  it('使えるPythonが無ければ選ばない', () => {
    expect(
      preferredPython({ ...setupCheckResult, pythons: [{ path: '/usr/bin/python3', version: '3.6.8' }] }),
    ).toBeNull();
  });

  it('接続できたのは、終わった確認でSSH接続がOKのときだけ', () => {
    expect(isConnectionReached(setupCheck)).toBe(true);
    expect(isConnectionReached({ ...setupCheck, status: 'claimed' })).toBe(false);
    expect(
      isConnectionReached({
        ...setupCheck,
        result: {
          ...setupCheckResult,
          items: [{ name: 'connection', status: 'ng', code: 'ssh_failed', detail: null }],
        },
      }),
    ).toBe(false);
  });

  it('GPUの選択は手入力のIDを残して切り替え、同時実行数は人が変えるまでGPUの数に合わせる', () => {
    const typed = { ...newComputer, gpuIds: '0\nnode2:0', maxConcurrentJobs: '2' };
    const toggled = toggleGpuId(typed, '0');
    expect(toggled.gpuIds).toBe('node2:0');
    expect(withConcurrencyFollowingGpus(typed, toggled).maxConcurrentJobs).toBe('1');
    expect(withConcurrencyFollowingGpus(typed, { ...typed, name: 'x' })).toEqual({
      ...typed,
      name: 'x',
    });
    expect(defaultConcurrentJobs([])).toBe('1');
  });
});
