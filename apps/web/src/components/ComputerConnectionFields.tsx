import type { ReactNode } from 'react';
import type { TargetCheckWorker, TargetCheckWorkerPresence } from '@mmt/contracts';
import type { FieldSuggestions, FormField, FormValues } from '../types/form';
import { CheckWorkerPicker } from './CheckWorkerPicker';
import { ComputerVisibilityField } from './ComputerVisibilityField';
import { FormFields } from './FormFields';
import { findCheckWorker } from '../lib/checkWorkerChoice';
import { getFieldValue } from '../lib/formValues';
import { completeFromKnownPaths } from '../lib/targetPathCompletion';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

const MAX_PORT = 65535;

/** 選んだworkerのホストにあるパスから出す候補。何も入力する前はすべてを出す。 */
function suggestWorkerPaths(paths: readonly string[]) {
  return async (value: string): Promise<FieldSuggestions> => ({
    items: completeFromKnownPaths(paths, value),
  });
}

/**
 * sshかlocalのコンピュータの手順1「接続」。名前（と`kindPicker`による種類）、公開範囲、SSHのworkerが
 * どこへ、workerのホストのどの鍵とknown_hostsで接続するか、確認するworker。localのコンピュータは
 * workerのホストで動くので、SSHの欄は無い。
 */
export function ComputerConnectionFields({
  values,
  onChange,
  kindPicker,
  workers,
  worker,
  onWorkerChange,
  onReloadWorkers,
}: {
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** SSHかLocal（コンピュータを追加するときはSiteも）。名前の後に表示する。 */
  kindPicker?: ReactNode;
  workers: readonly TargetCheckWorkerPresence[];
  worker: TargetCheckWorker | null;
  onWorkerChange: (worker: TargetCheckWorker) => void;
  onReloadWorkers: () => void;
}) {
  useLocale();
  const executor = getFieldValue(values, 'executor') === 'local' ? 'local' : 'ssh';
  const isSsh = executor === 'ssh';
  const sshFiles = findCheckWorker(workers, worker)?.sshFiles;
  const sshFileHint = sshFiles ? undefined : text.sshFileHintNoWorker;
  // 別のworker（または一覧が届いたときの最初のworker）は別のファイルを候補に出す。
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
      <ComputerVisibilityField values={values} onChange={onChange} />
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
