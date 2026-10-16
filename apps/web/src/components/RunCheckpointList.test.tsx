import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Run } from '@mmt/contracts';
import { RunCheckpointList } from './RunCheckpointList';

const failedRun = {
  id: 'run-a',
  projectId: 'project',
  status: 'failed',
  createdBy: 'editor-a',
  createdByName: '研究者',
} as Run;

const render = (run: Run, canRetryJob: boolean) =>
  renderToStaticMarkup(<RunCheckpointList run={run} canRetryJob={canRetryJob} />);

const CREATOR_ONLY = 'checkpointからの再開は、このRunの作成者かProject adminだけができます。';

describe('Runのcheckpointの一覧', () => {
  it('Jobを再実行できない人には、止まったRunでも再開を出さず理由を文で示す', () => {
    expect(render(failedRun, false)).toContain(CREATOR_ONLY);
  });

  it('再実行できる人と、まだ止まっていないRunには理由を出さない', () => {
    expect(render(failedRun, true)).not.toContain(CREATOR_ONLY);
    expect(render({ ...failedRun, status: 'running' }, false)).not.toContain(CREATOR_ONLY);
  });
});
