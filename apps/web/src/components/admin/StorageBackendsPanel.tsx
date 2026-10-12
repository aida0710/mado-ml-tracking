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
import { hasStorageTestPassed, StorageTestResult } from './StorageTestResult';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { joinSentences } from '../../i18n/textJoining';

type BackendDialog = { mode: 'create' } | { mode: 'edit'; backend: StorageBackend };

/**
 * The admin "storage" section: backends, their connection tests and the default for new Projects.
 * Saving a backend tests it, and a backend becomes the default only after passing a test.
 */
export function StorageBackendsPanel() {
  useLocale();
  const storage = useStorageBackends();
  // Only a backend saved from the screen can be edited there (not one defined by variables).
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
  // A backend becomes the default only after it passes a fresh test, which is shown either way.
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
            // Saving tests the connection at once, so a typo shows before anything is stored.
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
