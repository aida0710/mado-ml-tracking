import { CopyButton } from './CopyButton';

/**
 * ほかの場所に貼り付ける値（ID、コマンド、公開鍵、webhookのsecret）と、それを正確にコピーする
 * ボタン。IDは長く、ダブルクリックでは一部しか選択されないため。
 */
export function CopyableValue({ value, label }: { value: string; label?: string }) {
  return (
    <div className="copyable-value">
      {label && <span className="copyable-value-label">{label}</span>}
      <code>{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
