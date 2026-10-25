import { RefreshCw } from 'lucide-react';
import type { ComputeTarget, TargetCheckWorker, TargetCheckWorkerPresence } from '@mmt/contracts';
import { OptionPicker } from './OptionPicker';
import { checkWorkerOf, findCheckWorker } from '../lib/checkWorkerChoice';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

const workerKey = (worker: TargetCheckWorker) => `${worker.tokenId}:${worker.workerId}`;

/**
 * コンピュータを確認し、そのディレクトリを読むオンラインのworkerを選ぶ。workerが無いときは、
 * 設定を手で進めることになると伝える。
 */
export function CheckWorkerPicker({
  workers,
  value,
  onChange,
  onReload,
  executor,
}: {
  workers: readonly TargetCheckWorkerPresence[];
  value: TargetCheckWorker | null;
  onChange: (worker: TargetCheckWorker) => void;
  onReload: () => void;
  executor: ComputeTarget['executor'];
}) {
  useLocale();
  if (!workers.length)
    return (
      <div className="notice check-worker-none">
        <span>{text.checkWorkersNone}</span>
        <button type="button" className="button" onClick={onReload}>
          <RefreshCw size={14} />
          {text.checkWorkersReload}
        </button>
      </div>
    );
  const chosen = findCheckWorker(workers, value);
  return (
    <OptionPicker
        name="check-worker"
        legend={text.checkWorker}
        className="check-worker-picker"
        options={workers.map((worker) => ({
          value: workerKey(worker),
          label: (
            <span className="mono">
              {textTemplates.checkWorkerLabel(worker.workerId, worker.hostname)}
            </span>
          ),
          hint: textTemplates.checkWorkerSource(worker.tokenName),
        }))}
        value={chosen ? workerKey(chosen) : null}
        onChange={(key) => {
          const worker = workers.find((candidate) => workerKey(candidate) === key);
          if (worker) onChange(checkWorkerOf(worker));
        }}
        hint={executor === 'local' ? text.checkWorkerLocalHint : text.checkWorkerHint}
      />
  );
}
