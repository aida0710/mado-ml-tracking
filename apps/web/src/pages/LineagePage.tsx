import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { trackingApi } from '../api/tracking';
import { useProject } from '../hooks/useProject';
import { useQuery } from '../hooks/useQuery';
import { PageHeader } from '../components/PageHeader';
import { Resource } from '../components/Feedback';
import { LineageGraph } from '../components/LineageGraph';
import { focusLineage, LINEAGE_FOCUS_PARAMETER } from '../lib/lineageFocus';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { lineageText, lineageTextTemplates } from '../i18n/lineage';

// Two relations each way reach from data through its Runs to the models they made.
const FOCUS_DEPTH = 2;

export function LineagePage() {
  useLocale();
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const focusId = params.get(LINEAGE_FOCUS_PARAMETER);
  const graph = useQuery({ key: `${project.id}:lineage`, load: (signal) =>
    trackingApi.lineage(project.id, signal),
  });
  function showWholeGraph() {
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.delete(LINEAGE_FOCUS_PARAMETER);
      return updated;
    });
  }
  return (
    <section className="page lineage-page">
      <PageHeader
        title={text.lineage}
        eyebrow={project.name}
        actions={
          <button className="icon-button" aria-label={text.refresh} onClick={graph.reload}>
            <RefreshCw size={17} />
          </button>
        }
      />
      <Resource query={graph}>
        {(value) => {
          const isModelFocus = value.nodes.some((node) => node.id === focusId && node.kind === 'modelVersion');
          const focused = focusId ? focusLineage(value, {
            nodeId: focusId,
            ...(isModelFocus ? {} : { depth: FOCUS_DEPTH }),
          }) : null;
          const focusNode = focused?.nodes.find((node) => node.id === focusId);
          return (
            <>
              {focusId && (
                <div className="notice lineage-focus-notice" role="status" data-testid="lineage-focus">
                  <span>
                    {focusNode
                      ? isModelFocus
                        ? lineageTextTemplates.lineageModelFocused(focusNode.label)
                        : lineageTextTemplates.lineageFocused(focusNode.label, FOCUS_DEPTH)
                      : lineageText.lineageFocusMissing}
                  </span>
                  <button type="button" className="button small" onClick={showWholeGraph}>
                    {lineageText.lineageShowWhole}
                  </button>
                </div>
              )}
              <LineageGraph key={`${project.id}:${focusId ?? ''}`} graph={focused ?? value}
                projectId={project.id} initialSelectedNodeId={focused ? focusId : null} />
            </>
          );
        }}
      </Resource>
    </section>
  );
}
