import type { CodeVersion, RunKind } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import { explainMissingCodeCandidates } from './codeCandidateReason';
import { meetsCodeRequirement } from './executionValidation';

const code = (fields: Partial<CodeVersion>): CodeVersion => ({
  id: 'code-version',
  codeId: 'code',
  projectId: 'project',
  version: 'v1',
  source: null,
  runtime: { kind: 'python' },
  entrypoint: ['python', 'main.py'],
  requirements: [],
  environment: {},
  supportedModelFamilies: ['qwen3'],
  taskTypes: ['inference'],
  createdAt: '2026-10-11T00:00:00Z',
  ...fields,
});

describe('コードバージョンが候補に出ない理由', () => {
  it('対応するコードバージョンがあれば理由は無い', () => {
    expect(
      explainMissingCodeCandidates({ codeVersions: [code({})], taskType: 'inference', families: ['qwen3'] }),
    ).toBeNull();
  });

  it('コードバージョンが1つも無い', () => {
    expect(explainMissingCodeCandidates({ codeVersions: [], taskType: 'inference' })).toEqual({
      kind: 'no_code_versions',
    });
  });

  it('実行種別に対応するものが無い', () => {
    expect(
      explainMissingCodeCandidates({ codeVersions: [code({})], taskType: 'evaluation', families: ['qwen3'] }),
    ).toEqual({ kind: 'no_task_type', taskType: 'evaluation' });
  });

  it('実行種別には合うが系列が違うとき、大文字小文字だけ違う系列を挙げる', () => {
    expect(
      explainMissingCodeCandidates({
        codeVersions: [
          code({ supportedModelFamilies: ['Qwen3', 'linear'] }),
          // 別の種類を実行するコードなので、系列は原因ではない。
          code({ supportedModelFamilies: ['QWEN3'], taskTypes: ['training'] }),
        ],
        taskType: 'inference',
        families: ['qwen3'],
      }),
    ).toEqual({ kind: 'no_family', family: 'qwen3', caseVariants: ['Qwen3'] });
  });

  it('実行種別を指定しなければ（既定のコード）系列だけで判定する', () => {
    expect(
      explainMissingCodeCandidates({
        codeVersions: [code({ taskTypes: ['training'] })],
        families: ['qwen3'],
      }),
    ).toBeNull();
    expect(
      explainMissingCodeCandidates({ codeVersions: [code({})], families: ['linear'] }),
    ).toEqual({ kind: 'no_family', family: 'linear', caseVariants: [] });
  });

  it('モデルを選んでいなければ系列では絞らない', () => {
    expect(explainMissingCodeCandidates({ codeVersions: [code({})], taskType: 'inference' })).toBeNull();
  });

  it('自動実行ルールの複数の系列: 扱えない系列があればそれを、どれも扱えるが1つのコードでは揃わなければそう言う', () => {
    const qwen = code({ supportedModelFamilies: ['qwen3'] });
    const linear = code({ supportedModelFamilies: ['linear'] });
    expect(
      explainMissingCodeCandidates({
        codeVersions: [qwen, linear],
        taskType: 'inference',
        families: ['qwen3', 'Linear'],
      }),
    ).toEqual({ kind: 'no_family', family: 'Linear', caseVariants: ['linear'] });
    expect(
      explainMissingCodeCandidates({
        codeVersions: [qwen, linear],
        taskType: 'inference',
        families: ['qwen3', 'linear'],
      }),
    ).toEqual({ kind: 'no_common_family', families: ['qwen3', 'linear'] });
    expect(
      explainMissingCodeCandidates({
        codeVersions: [code({ supportedModelFamilies: ['qwen3', 'linear'] })],
        taskType: 'inference',
        families: ['qwen3', 'linear'],
      }),
    ).toBeNull();
  });

  it('理由を出すのは、候補に出るコードバージョン（meetsCodeRequirement を満たすもの）が無いときだけ', () => {
    const inference = code({ supportedModelFamilies: ['qwen3'], taskTypes: ['inference'] });
    const training = code({ supportedModelFamilies: ['Qwen2'], taskTypes: ['training'] });
    const codeVersionSets = [[], [inference], [training], [inference, training]];
    const taskTypes: (RunKind | undefined)[] = [undefined, 'inference', 'training', 'evaluation'];
    const families = [undefined, 'qwen3', 'Qwen2', 'linear'];
    const cases = codeVersionSets.flatMap((codeVersions) =>
      taskTypes.flatMap((taskType) => families.map((family) => ({ codeVersions, taskType, family }))),
    );
    for (const { codeVersions, taskType, family } of cases) {
      const isOffered = codeVersions.some((version) =>
        meetsCodeRequirement(version, { taskType, families: family ? [family] : [] }),
      );
      const reason = explainMissingCodeCandidates({
        codeVersions,
        taskType,
        families: family ? [family] : [],
      });
      expect(reason === null, JSON.stringify({ count: codeVersions.length, taskType, family })).toBe(
        isOffered,
      );
    }
  });
});
