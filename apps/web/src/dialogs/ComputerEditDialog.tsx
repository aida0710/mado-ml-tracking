import { useId, useState } from 'react';
import { PlugZap } from 'lucide-react';
import type { AuthConfig, ComputeTargetDetails, ComputeTargetExecutor } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { useCheckWorkerChoice } from '../hooks/useCheckWorkerChoice';
import { useMutation } from '../hooks/useMutation';
import { useTargetCheck } from '../hooks/useTargetCheck';
import { useTargetDirectoryListings } from '../hooks/useTargetDirectoryListings';
import { useTargetForm } from '../hooks/useTargetForm';
import { useTargetPathSuggestions } from '../hooks/useTargetPathSuggestions';
import { ComputerConnectionFields } from '../components/ComputerConnectionFields';
import { ComputerKindPicker } from '../components/ComputerKindPicker';
import { ComputerSetupFields } from '../components/ComputerSetupFields';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { Tabs } from '../components/Tabs';
import { TargetCheckStatus } from '../components/TargetCheckStatus';
import { buildConnectionPatch, hasConnectionChanges } from '../lib/computerSetupInput';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

type ComputerEditTab = 'connection' | 'setup';

/**
 * Edits an ssh or local computer in the two parts it was added with,「接続」and「接続後の設定」,
 * switched by tabs and saved together. ［再確認］asks the chosen worker to check it again (saving
 * a changed connection first) and refreshes the candidates of the paths, CPU and GPUs.
 */
export function ComputerEditDialog({
  auth,
  target,
  onClose,
  onSaved,
}: {
  auth: AuthConfig;
  target: ComputeTargetDetails;
  onClose: () => void;
  onSaved: (target: ComputeTargetDetails) => void;
}) {
  useLocale();
  const panelId = useId();
  const form = useTargetForm({ target, canAddSshOrLocal: true });
  // The computer as saved: a re-check saves a changed connection before the worker reads it.
  const [saved, setSaved] = useState(target);
  const [tab, setTab] = useState<ComputerEditTab>('connection');
  const check = useTargetCheck(target.id);
  const choice = useCheckWorkerChoice(check.latest?.assignedWorker ?? null);
  const listings = useTargetDirectoryListings({ targetId: target.id, worker: choice.worker });
  const paths = useTargetPathSuggestions({ check: check.latestFinished, listings });
  const [concurrencyFollowsGpus, setConcurrencyFollowsGpus] = useState(false);
  const recheckMutation = useMutation();
  const pending = form.pending || recheckMutation.pending || check.pending;
  const executor = getFieldValue(form.values, 'executor') as ComputeTargetExecutor;
  const kinds: ComputeTargetExecutor[] =
    auth.mode === 'development' || target.executor === 'local' ? ['ssh', 'local'] : ['ssh'];

  const recheck = () => {
    const worker = choice.worker;
    if (!worker) return;
    void recheckMutation.run(async () => {
      if (hasConnectionChanges(form.values, saved))
        setSaved(
          await executionApi.updateTarget(saved.id, buildConnectionPatch(form.values, saved)),
        );
      await check.request({ worker });
    });
  };

  return (
    <Dialog title={text.editTarget} onClose={onClose} dismissible={!pending} size="wide">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().then((updated) => {
            if (updated) onSaved(updated);
          });
        }}
      >
        <Tabs
          tabs={[
            { key: 'connection', label: text.setupStepConnection },
            { key: 'setup', label: text.setupStepSettings },
          ]}
          selected={tab}
          onSelect={(key) => setTab(key as ComputerEditTab)}
          panelId={panelId}
        />
        <div className="target-check-bar">
          <TargetCheckStatus check={check.latest} executor={executor} />
          <button
            type="button"
            className="button"
            onClick={recheck}
            disabled={pending || check.isInProgress || !choice.worker}
          >
            <PlugZap size={15} />
            {text.recheck}
          </button>
        </div>
        {hasConnectionChanges(form.values, saved) && (
          <p className="field-hint">{text.recheckHint}</p>
        )}
        <ErrorNotice message={recheckMutation.error ?? check.error} />
        <div role="tabpanel" id={panelId}>
          <fieldset disabled={pending}>
            {tab === 'connection' ? (
              <ComputerConnectionFields
                values={form.values}
                onChange={form.changeValues}
                kindPicker={
                  <ComputerKindPicker
                    kinds={kinds}
                    value={executor}
                    onChange={(kind) => form.changeValues({ ...form.values, executor: kind })}
                  />
                }
                workers={choice.workers.value ?? []}
                worker={choice.worker}
                onWorkerChange={choice.choose}
                onReloadWorkers={choice.workers.reload}
              />
            ) : (
              <ComputerSetupFields
                values={form.values}
                onChange={form.changeValues}
                result={check.latestFinished?.result}
                suggestWorkDirectory={paths.suggestWorkDirectory}
                suggestPython={paths.suggestPython}
                suggestionsRefreshKey={paths.refreshKey}
                concurrencyFollowsGpus={concurrencyFollowsGpus}
                onConcurrencyEdited={() => setConcurrencyFollowsGpus(false)}
              />
            )}
          </fieldset>
        </div>
        <ErrorNotice message={form.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={pending}>
            {form.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
