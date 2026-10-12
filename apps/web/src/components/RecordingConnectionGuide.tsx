import { useId, useState } from 'react';
import { TOKEN_PURPOSE_SCOPES, type Experiment } from '@mmt/contracts';
import { CodeSnippet } from './CodeSnippet';
import { CopyableValue } from './CopyableValue';
import { ProjectTokenButton } from './ProjectTokenButton';
import { Tabs } from './Tabs';
import { useProject } from '../hooks/useProject';
import { buildSdkConnectionSnippets, type SdkConnectionSnippets } from '../lib/sdkConnectionSnippets';
import {
  buildMlflowConnectionSnippets,
  type MlflowConnectionSnippets,
} from '../lib/tokenUsageSnippet';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

type RecordingClient = 'sdk' | 'mlflow';

/**
 * How to record into this Project from the Mado Python SDK or the MLflow 3 SDK, with the IDs to
 * copy and the examples filled in with them: the Project's on its settings page, and also the
 * chosen Experiment's on the Experiments page. The URLs come from the address the page was opened
 * with, because the Web server forwards /api to the API.
 */
export function RecordingConnectionGuide({
  experiment,
  onTokenCreated,
}: {
  experiment?: Pick<Experiment, 'id' | 'name'>;
  onTokenCreated?: () => void;
}) {
  useLocale();
  const { project } = useProject();
  const [client, setClient] = useState<RecordingClient>('sdk');
  const headingId = useId();
  const panelId = useId();
  const origin = window.location.origin;
  return (
    <section className="settings-section recording-connection" aria-labelledby={headingId}>
      <div className="section-heading">
        <h2 id={headingId}>{text.recordingConnection}</h2>
        <ProjectTokenButton
          label={text.recordingConnectionIssueToken}
          scopes={TOKEN_PURPOSE_SCOPES.recording}
          onCreated={onTokenCreated}
        />
      </div>
      <dl className="connection-values">
        <ConnectionValue name={text.projectId} value={project.id} />
        {experiment && <ConnectionValue name={text.experimentId} value={experiment.id} />}
      </dl>
      <Tabs
        tabs={[
          { key: 'sdk', label: text.recordingWithSdk },
          { key: 'mlflow', label: text.recordingWithMlflow },
        ]}
        selected={client}
        onSelect={(key) => setClient(key as RecordingClient)}
        panelId={panelId}
      />
      <div role="tabpanel" id={panelId} className="recording-connection-panel">
        {client === 'sdk' ? (
          <SdkRecordingSnippets
            snippets={buildSdkConnectionSnippets({
              origin,
              projectId: project.id,
              experimentId: experiment?.id,
            })}
            hasExperiment={Boolean(experiment)}
          />
        ) : (
          <MlflowRecordingSnippets
            snippets={buildMlflowConnectionSnippets({
              origin,
              projectId: project.id,
              experimentName: experiment?.name,
            })}
          />
        )}
      </div>
    </section>
  );
}

function SdkRecordingSnippets({
  snippets,
  hasExperiment,
}: {
  snippets: SdkConnectionSnippets;
  hasExperiment: boolean;
}) {
  useLocale();
  return (
    <>
      <CodeSnippet label={text.recordingSdkInstall} code={snippets.install} />
      <CodeSnippet label={text.recordingEnvironment} code={snippets.environment} />
      <CodeSnippet label={text.recordingPython} code={snippets.python} />
      <p className="muted">
        {hasExperiment ? text.recordingSdkExperimentByName : text.recordingSdkNamedExperiment}
      </p>
    </>
  );
}

function MlflowRecordingSnippets({ snippets }: { snippets: MlflowConnectionSnippets }) {
  useLocale();
  return (
    <>
      <dl className="connection-values">
        <ConnectionValue name="MLFLOW_TRACKING_URI" value={snippets.trackingUri} isVariable />
        <ConnectionValue name="MLFLOW_REGISTRY_URI" value={snippets.registryUri} isVariable />
      </dl>
      <CodeSnippet label={text.recordingEnvironment} code={snippets.bearerEnvironment} />
      <CodeSnippet label={text.recordingPython} code={snippets.python} />
      <details className="connection-more">
        <summary>{text.mlflowConnectionMore}</summary>
        <p className="muted">{text.mlflowConnectionServiceAccountHint}</p>
        <CodeSnippet label={text.mlflowConnectionBasic} code={snippets.basicEnvironment} />
      </details>
    </>
  );
}

function ConnectionValue({
  name,
  value,
  isVariable = false,
}: {
  name: string;
  value: string;
  /** `name` is an environment variable, set in the code font. */
  isVariable?: boolean;
}) {
  useLocale();
  return (
    <div>
      <dt className={isVariable ? 'mono' : undefined}>{name}</dt>
      <dd>
        <CopyableValue value={value} />
      </dd>
    </div>
  );
}
