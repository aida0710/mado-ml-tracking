import { useState } from 'react';
import type { StorageBackend } from '@mmt/contracts';
import type { FieldSuggestions, FormField, FormValues } from '../types/form';
import { storageApi } from '../api/storage';
import { Dialog } from '../components/Dialog';
import { FormFields } from '../components/FormFields';
import { ErrorNotice } from '../components/Feedback';
import { useMutation } from '../hooks/useMutation';
import { getFieldValue } from '../lib/formValues';
import {
  buildStorageBackendCreate,
  buildStorageBackendPatch,
  createStorageBackendValues,
  MAX_MULTIPART_PART_SIZE_MIB,
  MIN_MULTIPART_PART_SIZE_MIB,
  PEM_CERTIFICATE_HEADER,
  isSignatureV2,
  updateStorageBackendValues,
} from '../lib/storageBackendInput';
import { toDirectoryFieldSuggestions } from '../lib/storageDirectorySuggestions';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

const isS3 = (values: FormValues) => getFieldValue(values, 'kind') === 's3';
const isFilesystem = (values: FormValues) => !isS3(values);

/** 保存先を作る。または画面から保存した保存先（`backend`）を編集する。 */
export function StorageBackendDialog({
  backend,
  onClose,
  onSaved,
}: {
  backend?: StorageBackend;
  onClose: () => void;
  onSaved: (backend: StorageBackend) => void;
}) {
  useLocale();
  const [values, setValues] = useState(() =>
    backend ? updateStorageBackendValues(backend) : createStorageBackendValues(),
  );
  const mutation = useMutation();
  const title = backend ? text.editStorageBackend : text.newStorageBackend;
  return (
    <Dialog title={title} onClose={onClose} dismissible={!mutation.pending} size="wide">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutation
            .run(() => saveBackend(values, backend))
            .then((saved) => {
              if (saved) onSaved(saved);
            });
        }}
      >
        <fieldset disabled={mutation.pending}>
          <FormFields fields={buildFields(backend)} values={values} onChange={setValues} />
          {/* 多くのS3の設定でそのままにする項目。Endpoint、Bucketとアクセスキーが目立つよう折りたたむ。 */}
          {isS3(values) && (
            <details className="storage-advanced">
              <summary>{text.storageAdvancedSettings}</summary>
              <FormFields
                fields={buildAdvancedS3Fields(backend)}
                values={values}
                onChange={setValues}
              />
            </details>
          )}
        </fieldset>
        <ErrorNotice message={mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : backend ? text.save : text.create}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function saveBackend(values: FormValues, backend?: StorageBackend) {
  return backend
    ? storageApi.updateBackend(backend.name, buildStorageBackendPatch(values, backend))
    : storageApi.createBackend(buildStorageBackendCreate(values));
}

// 欄が空なら最上位を並べる。データ用のディスクはそこにある（OS自身のディレクトリは
// APIが除く）。
const EMPTY_ROOT_PATH_LISTING = '/';

/** 入力中のルートのパスを補完する、APIサーバー上のディレクトリ。 */
async function suggestRootDirectories(
  path: string,
  signal: AbortSignal,
): Promise<FieldSuggestions> {
  return toDirectoryFieldSuggestions(
    await storageApi.directorySuggestions(path || EMPTY_ROOT_PATH_LISTING, signal),
  );
}

function buildFields(backend?: StorageBackend): FormField[] {
  return [
    { name: 'name', label: text.name, required: true, readOnly: Boolean(backend), maxLength: 63 },
    {
      name: 'kind',
      label: text.storageBackendKind,
      type: 'select',
      // 種類によって保存キーの読み方が決まるので、保存した保存先は種類を変えない。
      options: (backend ? [backend.kind] : (['s3', 'filesystem'] as const)).map((kind) => ({
        value: kind,
        label: text[kind],
      })),
    },
    {
      name: 'rootPath',
      label: text.storageRootPath,
      required: true,
      visible: isFilesystem,
      suggest: suggestRootDirectories,
      offerSuggestionsWhenEmpty: true,
      hint: text.storageRootPathHint,
    },
    {
      name: 'endpoint',
      label: text.storageEndpoint,
      type: 'url',
      placeholder: 'https://s3.example.internal:9000',
      visible: isS3,
    },
    { name: 'region', label: text.storageRegion, required: true, visible: isS3 },
    { name: 'bucket', label: text.storageBucket, required: true, visible: isS3 },
    { name: 'prefix', label: text.storagePrefix, visible: isS3 },
    { name: 'pathStyle', label: text.storagePathStyle, type: 'checkbox', visible: isS3 },
    { name: 'accessKeyId', label: text.storageAccessKeyId, visible: isS3 },
    {
      name: 'secretAccessKey',
      label: text.storageSecretAccessKey,
      type: 'password',
      placeholder: backend?.secretConfigured ? text.storageSecretConfigured : undefined,
      visible: isS3,
    },
    { name: 'enabled', label: text.storageEnabled, type: 'checkbox' },
  ];
}

/** 多くの保存先が既定のままにするS3の設定（署名、TLS、チェックサム、multipart）。 */
function buildAdvancedS3Fields(backend?: StorageBackend): FormField[] {
  return [
    {
      name: 'signatureVersion',
      label: text.storageSignature,
      type: 'select',
      options: [
        { value: 'v4', label: text.storageSignatureV4 },
        { value: 'v2', label: text.storageSignatureV2 },
      ],
    },
    { name: 'tlsVerify', label: text.storageTlsVerify, type: 'checkbox' },
    {
      name: 'caBundle',
      label: text.storageCaBundle,
      type: 'textarea',
      placeholder: backend?.caBundleConfigured
        ? text.storageCaBundleConfigured
        : PEM_CERTIFICATE_HEADER,
    },
    {
      name: 'clearCaBundle',
      label: text.storageClearCaBundle,
      type: 'checkbox',
      visible: () => Boolean(backend?.caBundleConfigured),
    },
    {
      name: 'checksumMode',
      label: text.storageChecksumMode,
      type: 'select',
      options: [
        { value: 'when_required', label: text.storageChecksumWhenRequired },
        { value: 'when_supported', label: text.storageChecksumWhenSupported },
      ],
      visible: (values) => !isSignatureV2(values),
    },
    { name: 'multipartEnabled', label: text.storageMultipartEnabled, type: 'checkbox' },
    {
      name: 'multipartPartSizeMib',
      label: text.storagePartSize,
      type: 'number',
      required: true,
      min: MIN_MULTIPART_PART_SIZE_MIB,
      max: MAX_MULTIPART_PART_SIZE_MIB,
      visible: (values) => getFieldValue(values, 'multipartEnabled') === 'true',
    },
  ];
}
