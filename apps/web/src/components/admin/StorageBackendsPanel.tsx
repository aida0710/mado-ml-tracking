import { useState } from 'react';
import type { StorageBackend, StorageTestResult as StorageTestResultValue } from '@mmt/contracts';
import { Plus, RefreshCw } from 'lucide-react';
import { storageApi } from '../../api/storage';
import { useStorageBackends } from '../../hooks/useStorageBackends';
import { useMutation } from '../../hooks/useMutation';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice, Resource } from '../Feedback';
import { StorageBackendDialog } from '../../dialogs/StorageBackendDialog';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { StorageBackendsTable } from './StorageBackendsTable';
import { StorageTestResult } from './StorageTestResult';
import { hasStorageTestPassed } from '../../lib/storageTestResult';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { joinSentences } from '../../i18n/textJoining';

type BackendDialog = { mode: 'create' } | { mode: 'edit'; backend: StorageBackend };

/**
 * 全体管理の「ストレージ」。保存先、その接続テスト、新しいProjectの既定の保存先を扱う。
 * 保存先は保存するとテストし、テストに通ってはじめて既定にできる。
 */
export function StorageBackendsPanel() {
  useLocale();
  const storage = useStorageBackends();
  // 画面から編集できるのは、画面で保存した保存先だけ（環境変数で定義したものは除く）。
  const editableBackend = (name: string, edit: (backend: StorageBackend) => void) => {
    const backend = storage.backends.value?.find((candidate) => candidate.name === name);
    return backend && backend.source !== 'environment' ? () => edit(backend) : undefined;
  };
  const [dialog, setDialog] = useState<BackendDialog | null>(null);
  const [defaultCandidate, setDefaultCandidate] = useState<StorageBackend | null>(null);
  const [testedBackend, setTestedBackend] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<StorageTestResultValue | null>(null);
  const test = useMutation();
  const runTest = (backend: StorageBackend) => {
    setTestedBackend(backend.name);
    setTestResult(null);
    void test.run(async () => setTestResult(await storageApi.testBackend(backend.name)));
  };
  // 保存先を既定にするのは、新たにテストして通ったときだけ。結果は通っても落ちても出す。
  const makeDefaultAfterTest = async (backend: StorageBackend) => {
    setTestedBackend(backend.name);
    setTestResult(null);
    const result = await storageApi.testBackend(backend.name);
    setTestResult(result);
    if (!hasStorageTestPassed(result)) throw new Error(text.storageMakeDefaultTestFailed);
    await storageApi.updateSettings({ defaultBackend: backend.name });
  };
  return (
    <section className="admin-storage">
      <SettingsPageHeader
        section="storage"
        actions={
          <>
            <button className="button primary" onClick={() => setDialog({ mode: 'create' })}>
              <Plus size={15} />
              {text.newStorageBackend}
            </button>
            <button className="icon-button" aria-label={text.refresh} onClick={storage.reload}>
              <RefreshCw size={17} />
            </button>
          </>
        }
      />
      <Resource query={storage.settings}>
        {(settings) => (
          <Resource query={storage.backends}>
            {(backends) => (
              <StorageBackendsTable
                backends={backends}
                defaultBackend={settings.defaultBackend}
                testingBackend={test.pending ? testedBackend : null}
                onTest={runTest}
                onEdit={(backend) => setDialog({ mode: 'edit', backend })}
                onMakeDefault={setDefaultCandidate}
              />
            )}
          </Resource>
        )}
      </Resource>
      <ErrorNotice message={test.error} />
      {testedBackend && testResult && (
        <StorageTestResult
          backendName={testedBackend}
          result={testResult}
          onEdit={editableBackend(testedBackend, (backend) => setDialog({ mode: 'edit', backend }))}
        />
      )}
      {dialog && (
        <StorageBackendDialog
          backend={dialog.mode === 'edit' ? dialog.backend : undefined}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            storage.backends.reload();
            // 保存すると直ちに接続をテストするので、データを置く前に打ち間違いに気付ける。
            runTest(saved);
          }}
        />
      )}
      {defaultCandidate && (
        <ConfirmDialog
          title={text.storageMakeDefaultTitle}
          message={joinSentences([
            textTemplates.storageMakeDefaultConfirm(defaultCandidate.name),
            text.storageMakeDefaultTestFirst,
          ])}
          confirmLabel={text.storageMakeDefault}
          onConfirm={() => makeDefaultAfterTest(defaultCandidate)}
          onConfirmed={() => {
            setDefaultCandidate(null);
            storage.settings.reload();
          }}
          onClose={() => setDefaultCandidate(null)}
        />
      )}
    </section>
  );
}
