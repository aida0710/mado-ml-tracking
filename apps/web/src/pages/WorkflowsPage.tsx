import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { workflowsApi } from '../api/workflows';
import { useQuery } from '../hooks/useQuery';
import { useProject } from '../hooks/useProject';
import { PageHeader } from '../components/PageHeader';
import { Resource } from '../components/Feedback';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { WorkflowDialog } from '../dialogs/WorkflowDialog';
import { workflowPath } from '../lib/workflowPath';
import { text } from '../i18n/catalog';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

export function WorkflowsPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const workflows = useQuery({ key: `workflows:${project.id}`, load: (signal) =>
    workflowsApi.list(project.id, signal),
  });
  return (
    <section className="page workflows-page">
      <PageHeader
        title={labels.workflows}
        eyebrow={project.name}
        description={labels.workflowDescription}
        actions={
          canEdit && (
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              {labels.workflowNew}
            </button>
          )
        }
      />
      <p className="muted">{labels.workflowCatalogBoundary}</p>
      <Resource query={workflows}>
        {(items) => (
          <ResponsiveTable
            rows={items}
            rowKey={(workflow) => workflow.id}
            columns={[
              {
                key: 'name',
                header: text.name,
                priority: 'primary',
                render: (workflow) => (
                  <Link to={workflowPath(project.id, { workflowId: workflow.id })}>
                    {workflow.name}
                  </Link>
                ),
              },
              {
                key: 'version',
                header: labels.workflowVersion,
                priority: 'primary',
                render: (workflow) => workflowsTextTemplates.workflowVersionLabel(workflow.latestRevision),
              },
              {
                key: 'description',
                header: text.description,
                priority: 'secondary',
                render: (workflow) => workflow.description,
              },
            ]}
          />
        )}
      </Resource>
      {creating && (
        <WorkflowDialog
          projectId={project.id}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            navigate(workflowPath(project.id, { workflowId: id }));
          }}
        />
      )}
    </section>
  );
}
