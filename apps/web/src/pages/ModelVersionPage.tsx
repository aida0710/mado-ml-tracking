import { Navigate, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type {
  DatasetVersion,
  ModelAutomationExecutionPage,
  ModelAutomationRule,
  ModelVersion,
  ModelVersionDetail,
  Run,
} from '@mmt/contracts';
import type { QueryState } from '../hooks/useQuery';
import { useProject } from '../hooks/useProject';
import { useProjectDatasetVersions } from '../hooks/useProjectDatasetVersions';
import { useModelVersionDetail } from '../hooks/useModelVersionDetail';
import { useModelVersionEvaluations } from '../hooks/useModelVersionEvaluations';
import { useEvaluationComparison } from '../hooks/useEvaluationComparison';
import { useEvaluationBaseline, type EvaluationBaseline } from '../hooks/useEvaluationBaseline';
import { useQuery } from '../hooks/useQuery';
import { registryApi } from '../api/registry';
import { usePromotionChoices } from '../hooks/usePromotionChoices';
import { PageHeader } from '../components/PageHeader';
import { ErrorNotice, Resource } from '../components/Feedback';
import { ModelTrainingSourcePanel } from '../components/ModelTrainingSourcePanel';
import { ModelVersionSummary } from '../components/ModelVersionSummary';
import { ModelVersionAutomation } from '../components/ModelVersionAutomation';
import { EvaluationResultsTable } from '../components/EvaluationResultsTable';
import { EvaluationComparisonPanel } from '../components/EvaluationComparisonPanel';
import { PromotionEvaluationTable } from '../components/PromotionEvaluationTable';
import { PromotionCheckCard } from '../components/PromotionCheckCard';
import { CommentThread } from '../components/comments/CommentThread';
import { collectSummaryMetrics, summarizeEvaluations } from '../lib/evaluationSummary';
import { modelVersionPath } from '../lib/modelVersionPath';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { evaluationTextTemplates } from '../i18n/evaluation';

/**
 * 1つのモデルバージョンを学習から結果まで見せる。どこから来たか、何の自動実行が走ったか、基準の
 * バージョンと比べた評価のメトリクス、昇格の判定。編集できる人は昇格の確認から昇格でき、
 * コメントを除いてほかは読み取りのみ。
 */
export function ModelVersionPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const { modelId = '', versionId = '' } = useParams();
  const { detail, sourceRun, rules, executions } = useModelVersionDetail(project.id, versionId);
  const trainingDatasets = useProjectDatasetVersions(
    project.id,
    Boolean(
      sourceRun.value?.trainingDatasetVersionIds?.length ||
        sourceRun.value?.inputDatasetVersionIds.length,
    ),
  );
  // モデルのすべてのバージョン。表示するバージョン番号と、選べる基準のバージョンに使う。
  const versions = useQuery({ key: `${project.id}:model-versions:${modelId}`, load: (signal) =>
    registryApi.modelVersions(project.id, modelId, signal),
  });
  const baseline = useEvaluationBaseline({
    aliases: detail.value?.model.aliases ?? {},
    candidateVersionId: versionId,
    versions: versions.value ?? [],
  });
  const evaluations = useModelVersionEvaluations(project.id, detail.value, baseline.versionId);
  // パネルの中ではなくここで読み、再読み込みのボタンでこれらも更新されるようにする。ページを
  // 開いたあとに終わった評価は、比較と判定の両方を変えるため。
  const evaluationComparison = useEvaluationComparison({
    projectId: project.id,
    modelId,
    candidateVersionId: versionId,
    baseline: baseline.choice,
  });
  const promotionChoices = usePromotionChoices(project.id, modelId, versionId);
  const reloadAll = () => {
    detail.reload();
    versions.reload();
    sourceRun.reload();
    trainingDatasets.reload();
    executions.reload();
    evaluations.results.reload();
    evaluations.baseline.results.reload();
    evaluations.promotionEvaluations.reload();
    evaluationComparison.comparison.reload();
    promotionChoices.reload();
  };
  // モデルのidが違うリンクでもバージョンは特定できるので、正しいアドレスへ移す。
  if (detail.value && detail.value.model.id !== modelId)
    return (
      <Navigate
        replace
        to={modelVersionPath(project.id, { modelId: detail.value.model.id, versionId })}
      />
    );
  return (
    <section className="page model-version-page">
      <PageHeader
        title={
          detail.value
            ? `${detail.value.model.name} / ${detail.value.version.version}`
            : text.modelVersion
        }
        eyebrow={`${project.name} · ${text.modelVersion}`}
        actions={
          <button className="icon-button" aria-label={text.refresh} onClick={reloadAll}>
            <RefreshCw size={17} />
          </button>
        }
      />
      <Resource query={detail}>
        {(value) => (
          <ModelVersionContent
            projectId={project.id}
            detail={value}
            sourceRun={sourceRun.value}
            trainingDatasets={trainingDatasets.value ?? []}
            rules={rules.value ?? []}
            versions={versions.value ?? []}
            selectedBaseline={baseline}
            executions={executions}
            evaluations={evaluations}
            evaluationComparison={evaluationComparison}
            promotionChoices={promotionChoices}
            canPromote={canEdit}
            onPromoted={reloadAll}
          />
        )}
      </Resource>
    </section>
  );
}

function ModelVersionContent({
  projectId,
  detail,
  sourceRun,
  trainingDatasets,
  rules,
  versions,
  selectedBaseline,
  executions,
  evaluations,
  evaluationComparison,
  promotionChoices,
  canPromote,
  onPromoted,
}: {
  projectId: string;
  detail: ModelVersionDetail;
  sourceRun: Run | undefined;
  trainingDatasets: DatasetVersion[];
  rules: ModelAutomationRule[];
  versions: ModelVersion[];
  selectedBaseline: EvaluationBaseline;
  executions: QueryState<ModelAutomationExecutionPage>;
  evaluations: ReturnType<typeof useModelVersionEvaluations>;
  evaluationComparison: ReturnType<typeof useEvaluationComparison>;
  promotionChoices: ReturnType<typeof usePromotionChoices>;
  canPromote: boolean;
  onPromoted: () => void;
}) {
  useLocale();
  const { results, baseline, promotionEvaluations } = evaluations;
  const resultRuns = results.value?.items ?? [];
  const evaluationRuns = resultRuns.filter((run) => run.kind === 'evaluation');
  const summary = summarizeEvaluations({
    candidateRuns: evaluationRuns,
    baselineRuns: baseline.results.value?.items ?? [],
    summaryMetrics: collectSummaryMetrics(evaluationRuns, rules),
  });
  // ページ中でバージョンは番号で示す。まだ読み込んでいないバージョンはidのまま。
  const versionLabel = (id: string) =>
    evaluationTextTemplates.versionLabel(
      (id === detail.version.id ? detail.version : versions.find((version) => version.id === id))
        ?.version ?? id,
    );
  const baselineLabel = !selectedBaseline.choice
    ? null
    : selectedBaseline.choice.kind === 'alias'
      ? selectedBaseline.choice.alias
      : versionLabel(selectedBaseline.choice.versionId);
  return (
    <>
      <ModelVersionSummary
        projectId={projectId}
        detail={detail}
        sourceRun={sourceRun}
        trainingDatasets={trainingDatasets}
        resultRuns={resultRuns}
      />
      <ModelTrainingSourcePanel
        projectId={projectId}
        detail={detail}
        sourceRun={sourceRun}
        canEdit={canPromote}
        onSaved={onPromoted}
      />
      <ModelVersionAutomation projectId={projectId} executions={executions} rules={rules} />
      <section className="model-version-section" aria-label={text.evaluationResults}>
        <h2>{text.evaluationResults}</h2>
        <ErrorNotice message={baseline.results.error} retry={baseline.results.reload} />
        <Resource query={results}>
          {(page) => (
            <>
              <EvaluationResultsTable
                projectId={projectId}
                runs={evaluationRuns}
                rules={rules}
                summary={summary}
                baselineLabel={baseline.versionId ? baselineLabel : null}
              />
              {page.nextCursor && <p className="muted">{text.evaluationResultsTruncated}</p>}
            </>
          )}
        </Resource>
      </section>
      <EvaluationComparisonPanel
        projectId={projectId}
        model={detail.model}
        candidateVersionId={detail.version.id}
        versions={versions}
        versionLabel={versionLabel}
        baseline={selectedBaseline}
        evaluationComparison={evaluationComparison}
        rules={rules}
      />
      {canPromote && (
        <PromotionCheckCard
          detail={detail}
          versionLabel={versionLabel}
          choices={promotionChoices}
          onPromoted={onPromoted}
        />
      )}
      <section className="model-version-section" aria-label={text.versionPromotionEvaluations}>
        <h2>{text.versionPromotionEvaluations}</h2>
        <ErrorNotice message={promotionEvaluations.error} retry={promotionEvaluations.reload} />
        <PromotionEvaluationTable
          evaluations={promotionEvaluations.items}
          projectId={projectId}
          versionLabel={versionLabel}
          canReevaluate={false}
          reevaluating={false}
          onReevaluate={() => undefined}
          empty={
            promotionEvaluations.loading ? text.loading : text.versionPromotionEvaluationsEmpty
          }
        />
        {promotionEvaluations.hasMore && (
          <button
            className="button small"
            disabled={promotionEvaluations.loading}
            onClick={promotionEvaluations.loadMore}
          >
            {text.loadMore}
          </button>
        )}
      </section>
      <CommentThread
        projectId={projectId}
        targetType="model_version"
        targetId={detail.version.id}
      />
    </>
  );
}
