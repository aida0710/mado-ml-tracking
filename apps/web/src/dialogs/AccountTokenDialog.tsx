import { useState } from 'react';
import type { Project } from '@mmt/contracts';
import type { QueryState } from '../hooks/useQuery';
import { Dialog } from '../components/Dialog';
import { Resource } from '../components/Feedback';
import { OptionPicker } from '../components/OptionPicker';
import { TokenDialog } from './TokenDialog';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/** Chooses the Project before opening the shared token form outside a Project's settings. */
export function AccountTokenDialog({
  projects,
  onClose,
  onCreated,
}: {
  projects: QueryState<Project[]>;
  onClose: () => void;
  onCreated: () => void;
}) {
  useLocale();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  if (project) return <TokenDialog project={project} onClose={onClose} onCreated={onCreated} />;
  return (
    <Dialog title={text.newToken} onClose={onClose}>
      <Resource query={projects}>
        {(items) =>
          items.length === 0 ? (
            <p className="muted">{text.accountTokenNoProjects}</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const selectedProject = items.find((item) => item.id === projectId);
                if (selectedProject) setProject(selectedProject);
              }}
            >
              <OptionPicker
                name="token-project"
                legend={text.project}
                options={items.map((item) => ({ value: item.id, label: item.name }))}
                value={projectId}
                onChange={setProjectId}
              />
              <footer>
                <button type="button" className="button" onClick={onClose}>
                  {text.cancel}
                </button>
                <button className="button primary" disabled={!projectId}>
                  {text.next}
                </button>
              </footer>
            </form>
          )
        }
      </Resource>
    </Dialog>
  );
}
