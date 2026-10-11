import * as contract from '@mmt/contracts/schemas';
import { workflowHistoryQuerySchema } from '../../domain/workflowValidation.js';
import { PROJECT_VIEWER, projectEditor, routeError, type NativeRoute } from './nativeRoute.js';

const WORKFLOWS = '/api/projects/:p/workflows';
const EXECUTIONS = '/api/projects/:p/workflow-executions';
const RUNS = '/api/projects/:p/runs';

export const WORKFLOW_ROUTES: readonly NativeRoute[] = [
  {
    method: 'get',
    path: WORKFLOWS,
    tag: 'workflows',
    summary: 'ワークフローの一覧',
    access: PROJECT_VIEWER,
    responses: { 200: contract.itemsOf(contract.workflowSchema) },
  },
  {
    method: 'post',
    path: WORKFLOWS,
    tag: 'workflows',
    summary: 'Taskの設定を固定したワークフローを作成',
    access: projectEditor('registry:write'),
    body: contract.workflowCreateSchema,
    responses: { 201: contract.workflowDetailSchema },
    errors: routeError(409, 'task_revision_conflict'),
  },
  {
    method: 'get',
    path: `${WORKFLOWS}/:id`,
    tag: 'workflows',
    summary: 'ワークフローと不変のバージョン',
    access: PROJECT_VIEWER,
    responses: { 200: contract.workflowDetailSchema },
  },
  {
    method: 'post',
    path: `${WORKFLOWS}/:id/versions`,
    tag: 'workflows',
    summary: 'ワークフローの新しいバージョンを作成',
    access: projectEditor('registry:write'),
    body: contract.workflowVersionCreateSchema,
    responses: { 201: contract.workflowVersionSchema },
    errors: routeError(409, 'workflow_revision_conflict', 'task_revision_conflict'),
  },
  {
    method: 'post',
    path: `${WORKFLOWS}/:id/launch`,
    tag: 'workflows',
    summary: '指定バージョンを実行、または成功済みステップを再利用して再開',
    access: projectEditor('runs:write'),
    body: contract.workflowLaunchSchema,
    responses: { 201: contract.workflowExecutionSchema },
    errors: routeError(409, 'workflow_launch_mismatch', 'workflow_resume_invalid'),
  },
  {
    method: 'get',
    path: `${WORKFLOWS}/:id/executions`,
    tag: 'workflows',
    summary: 'ワークフローの実行履歴（cursorページ）',
    access: PROJECT_VIEWER,
    query: workflowHistoryQuerySchema,
    responses: { 200: contract.workflowExecutionPageSchema },
  },
  {
    method: 'get',
    path: `${EXECUTIONS}/:id`,
    tag: 'workflows',
    summary: '実行とステップごとのRun・入出力・品質',
    access: PROJECT_VIEWER,
    responses: { 200: contract.workflowExecutionSchema },
  },
  {
    method: 'post',
    path: `${EXECUTIONS}/:id/cancel`,
    tag: 'workflows',
    summary: '所有者またはadminが実行を停止（実行中のJob終了まで待つ）',
    access: projectEditor('jobs:write'),
    responses: { 200: contract.workflowExecutionSchema },
    errors: routeError(403, 'workflow_control_forbidden'),
  },
  {
    method: 'get',
    path: `${RUNS}/:r/dataset-usage`,
    tag: 'runs',
    summary: '固定した入力バージョンの用途・重み・抽出条件',
    access: PROJECT_VIEWER,
    responses: { 200: contract.runDatasetUsageSchema },
  },
  {
    method: 'get',
    path: `${RUNS}/:r/preprocessing-report`,
    tag: 'runs',
    summary: '前処理レポート（未記録ならnull）',
    access: PROJECT_VIEWER,
    responses: { 200: contract.preprocessingReportResponseSchema },
  },
  {
    method: 'put',
    path: `${RUNS}/:r/preprocessing-report`,
    tag: 'runs',
    summary: '終了前のprocessing Runへ前処理レポートを保存',
    access: projectEditor('runs:write'),
    body: contract.preprocessingReportInputSchema,
    responses: { 200: contract.preprocessingReportSchema },
    errors: [
      ...routeError(409, 'run_finalized'),
      ...routeError(422, 'preprocessing_run_kind', 'preprocessing_samples_invalid'),
    ],
  },
];
