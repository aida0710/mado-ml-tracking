import { describe, expect, it } from 'vitest';
import { createWorkflowLaunchKeys } from './workflowLaunchKeys';

function sequentialKeys() {
  let count = 0;
  return () => `key-${++count}`;
}

describe('ワークフローの起動の重複防止キー', () => {
  it('答えが届かなかった起動を送り直すと、同じキーを使う（API が最初の実行を返す）', () => {
    const keys = createWorkflowLaunchKeys(sequentialKeys());
    const first = keys.keyFor({ revision: 2 });
    expect(keys.keyFor({ revision: 2 })).toBe(first);
  });

  it('実行が返った後の起動は、同じバージョンでも新しいキーにする', () => {
    const keys = createWorkflowLaunchKeys(sequentialKeys());
    const first = keys.keyFor({ revision: 2 });
    keys.markAccepted({ revision: 2 });
    expect(keys.keyFor({ revision: 2 })).not.toBe(first);
  });

  it('バージョンか再開元が違う起動には、別のキーを使う', () => {
    const keys = createWorkflowLaunchKeys(sequentialKeys());
    const fresh = keys.keyFor({ revision: 2 });
    const resume = keys.keyFor({ revision: 2, resumeFromExecutionId: 'e1' });
    expect(resume).not.toBe(fresh);
    expect(keys.keyFor({ revision: 3, resumeFromExecutionId: 'e1' })).not.toBe(resume);
  });

  it('答えが届かなかった起動は、間に別の起動をはさんでも、送り直すと同じキーを使う', () => {
    const keys = createWorkflowLaunchKeys(sequentialKeys());
    const lostStart = keys.keyFor({ revision: 2 });
    const resume = { revision: 1, resumeFromExecutionId: 'e1' };
    keys.keyFor(resume);
    keys.markAccepted(resume);
    expect(keys.keyFor({ revision: 2 })).toBe(lostStart);
  });
});
