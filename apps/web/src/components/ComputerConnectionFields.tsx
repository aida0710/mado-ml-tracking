import type { ReactNode } from 'react';
import type { ComputeTarget, TargetCheckWorker, TargetCheckWorkerPresence } from '@mmt/contracts';
import type { FieldSuggestions, FormField, FormValues } from '../types/form';
import { CheckWorkerPicker } from './CheckWorkerPicker';
import { ComputerVisibilityField } from './ComputerVisibilityField';
import { FormFields } from './FormFields';
import { findCheckWorker } from '../lib/checkWorkerChoice';
import { getFieldValue } from '../lib/formValues';
import { completeFromKnownPaths } from '../lib/targetPathCompletion';
import { text } from '../i18n/catalog';

const MAX_PORT = 65535;

/** Candidates from paths on the chosen worker's host, all of them before anything is typed. */
function suggestWorkerPaths(paths: readonly string[]) {
  return async (value: string): Promise<FieldSuggestions> => ({
    items: completeFromKnownPaths(paths, value),
  });
}

/**
 * Step 1「接続」of an ssh or local computer: its name (and kind, from `kindPicker`), visibility,
 * where an SSH worker connects with which key and known_hosts on the worker's host, and the worker
 * that checks it. A local computer runs on the worker's host and has no SSH fields.
 */
export function ComputerConnectionFields({
  values,
  onChange,
  target,
  kindPicker,
  workers,
  worker,
  onWorkerChange,
  onReloadWorkers,
}: {
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** The computer being edited, or the one step 1 saved; absent before. */
  target?: Pick<ComputeTarget, 'ownerUserId'>;
  /** SSH or Local (and Site while a computer is added), shown after the name. */
  kindPicker?: ReactNode;
  workers: readonly TargetCheckWorkerPresence[];
  worker: TargetCheckWorker | null;
  onWorkerChange: (worker: TargetCheckWorker) => void;
  onReloadWorkers: () => void;
}) {
  const executor = getFieldValue(values, 'executor') === 'local' ? 'local' : 'ssh';
  const isSsh = executor === 'ssh';
  const sshFiles = findCheckWorker(workers, worker)?.sshFiles;
  const sshFileHint = sshFiles ? undefined : text.sshFileHintNoWorker;
  // Another worker (or the first once the list arrives) offers other files.
  const sshFilesKey = sshFiles && worker ? `${worker.tokenId}:${worker.workerId}` : '';
  const nameField: FormField[] = [{ name: 'name', label: text.name, required: true }];
  const sshFields: FormField[] = [
    { name: 'host', label: text.host, required: true },
    { name: 'port', label: text.port, type: 'number', required: true, min: 1, max: MAX_PORT },
    { name: 'username', label: text.sshUsername, required: true },
    {
      name: 'sshKeyPath',
      label: text.sshKeyPath,
      required: true,
      suggest: suggestWorkerPaths(sshFiles?.keyPaths ?? []),
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey: sshFilesKey,
      hint: sshFileHint,
    },
    {
      name: 'knownHostsPath',
      label: text.knownHostsPath,
      required: true,
      suggest: suggestWorkerPaths(sshFiles?.knownHostsPaths ?? []),
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey: sshFilesKey,
      hint: sshFileHint,
    },
  ];
  return (
    <>
      <FormFields fields={nameField} values={values} onChange={onChange} />
      {kindPicker}
      <ComputerVisibilityField values={values} onChange={onChange} target={target} />
      {isSsh && <FormFields fields={sshFields} values={values} onChange={onChange} />}
      <CheckWorkerPicker
        workers={workers}
        value={worker}
        onChange={onWorkerChange}
        onReload={onReloadWorkers}
        executor={executor}
      />
    </>
  );
}
