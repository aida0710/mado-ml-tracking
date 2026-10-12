import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkflowExecution, WorkflowLaunch } from '@mmt/contracts';
import { workflowsApi } from '../api/workflows';
import { useWorkflowActions } from './useWorkflowActions';

afterEach(() => vi.restoreAllMocks());

/** The actions one rendering of the hook returns; they keep working after the render. */
function renderWorkflowActions(): ReturnType<typeof useWorkflowActions> {
  let actions: ReturnType<typeof useWorkflowActions> | undefined;
  function Probe() {
    actions = useWorkflowActions('project', 'workflow');
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return actions!;
}

const startedExecution = { id: 'execution', revision: 2 } as WorkflowExecution;

describe('ワークフローの起動の操作', () => {
  it('起動が失敗したら同じ鍵で送り直し、実行が返った後の起動だけを新しい鍵にする', async () => {
    const sent: WorkflowLaunch[] = [];
    vi.spyOn(workflowsApi, 'launch')
      .mockImplementationOnce(async (_project, _workflow, input) => {
        sent.push(input);
        throw new Error('the answer was lost');
      })
      .mockImplementation(async (_project, _workflow, input) => {
        sent.push(input);
        return startedExecution;
      });
    const actions = renderWorkflowActions();

    await expect(actions.launch({ revision: 2 })).rejects.toThrow('the answer was lost');
    await expect(actions.launch({ revision: 2 })).resolves.toBe(startedExecution);
    await actions.launch({ revision: 2 });

    const [failed, resent, next] = sent.map((input) => input.idempotencyKey);
    expect(resent).toBe(failed);
    expect(next).not.toBe(resent);
  });

  it('再開は、元の実行とバージョンを送る', async () => {
    const launch = vi.spyOn(workflowsApi, 'launch').mockResolvedValue(startedExecution);
    await renderWorkflowActions().launch({ revision: 1, resumeFromExecutionId: 'failed' });
    expect(launch).toHaveBeenCalledWith('project', 'workflow', {
      revision: 1,
      resumeFromExecutionId: 'failed',
      idempotencyKey: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });
});
