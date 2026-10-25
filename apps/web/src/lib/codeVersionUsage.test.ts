import { describe, expect, it } from 'vitest';
import type { Code, CodeVersion, ExperimentTask, Model, ModelAutomationRule } from '@mmt/contracts';
import { findCodeVersionUsage, findFamilyCodeVersions } from './codeVersionUsage';

const codeVersion = (fields: Partial<CodeVersion>): CodeVersion => ({
  id: 'code-v1',
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
const model = (id: string, family: string) => ({ id, name: id, family }) as Model;
const task = (id: string, codeVersionId: string) => ({ id, codeVersionId }) as ExperimentTask;
const rule = (id: string, codeVersionId: string) => ({ id, codeVersionId }) as ModelAutomationRule;

describe('コードバージョンの使われ方', () => {
  it('対応モデル系列が合うモデル（大文字小文字も一致するものだけ）と、選んでいるTask・ルールを挙げる', () => {
    const usage = findCodeVersionUsage({
      version: codeVersion({}),
      models: [model('voice', 'qwen3'), model('voice-typo', 'Qwen3'), model('asr', 'linear')],
      tasks: [task('infer', 'code-v1'), task('other', 'code-v2')],
      rules: [rule('auto', 'code-v1'), rule('old', 'code-v0')],
    });
    expect(usage.models.map((item) => item.id)).toEqual(['voice']);
    expect(usage.tasks.map((item) => item.id)).toEqual(['infer']);
    expect(usage.rules.map((item) => item.id)).toEqual(['auto']);
  });

  it('モデルの系列に対応するコードバージョンを、コード名と一緒に返す', () => {
    const codes = [{ id: 'code', name: '推論' } as Code];
    const found = findFamilyCodeVersions({
      family: 'qwen3',
      codes,
      codeVersions: [
        codeVersion({ id: 'match', supportedModelFamilies: ['linear', 'qwen3'] }),
        codeVersion({ id: 'case-only', supportedModelFamilies: ['QWEN3'] }),
        // コードが一覧に無い（削除された）バージョンは候補に出さない。
        codeVersion({ id: 'orphan', codeId: 'gone' }),
      ],
    });
    expect(found.map(({ code, version }) => `${code.name}:${version.id}`)).toEqual(['推論:match']);
  });
});
